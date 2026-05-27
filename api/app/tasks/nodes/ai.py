import base64
import json
import os
import time

import fitz  # pymupdf
from openai import OpenAI

from app.config import settings
from app.database import SessionLocal
from app.models.setting import AppSetting
from app.tasks.celery_app import celery_app
from app.tasks.nodes.base import (
    mark_step_running, mark_step_done, mark_step_failed,
    mark_run_failed, step_log, raise_if_cancelled,
)
from app.tasks.nodes.template import render_template

MAX_IMAGES = 20


def _encode_image(path: str) -> str:
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def _image_content(b64: str, media_type: str = "image/png") -> dict:
    return {
        "type": "image_url",
        "image_url": {"url": f"data:{media_type};base64,{b64}"},
    }


def _pdf_to_b64_images(pdf_path: str, max_pages: int = MAX_IMAGES, scale: float = 2.0) -> list[str]:
    result = []
    doc = fitz.open(pdf_path)
    for i, page in enumerate(doc):
        if i >= max_pages:
            break
        mat = fitz.Matrix(scale, scale)
        pix = page.get_pixmap(matrix=mat)
        result.append(base64.b64encode(pix.tobytes("png")).decode("utf-8"))
    return result


@celery_app.task(name="nodes.ai", bind=True)
def ai_task(self, input_data: dict, run_id: int, step_id: int, node_config: dict | None = None) -> dict:
    mark_step_running(step_id)
    try:
        raise_if_cancelled(run_id)
        cfg = node_config or {}
        system_prompt = cfg.get("system_prompt", "").strip()
        if not system_prompt:
            raise ValueError("AI node requires a system_prompt in node config")

        with SessionLocal() as db:
            api_key_row = db.get(AppSetting, "openrouter_api_key")
            model_row = db.get(AppSetting, "openrouter_default_model")

        api_key = (api_key_row.value if api_key_row else None) or settings.openrouter_api_key
        if not api_key:
            raise ValueError("OpenRouter API key not configured. Set it in Settings → OpenRouter.")

        default_model = (model_row.value if model_row else None) or settings.openrouter_default_model
        model = cfg.get("model") or default_model

        rendered_prompt = render_template(system_prompt, input_data)

        # Build document images from image_paths, PDF, or image file
        doc_images: list[str] = []
        image_paths: list[str] = input_data.get("image_paths", [])

        if image_paths:
            for rel_path in image_paths[:MAX_IMAGES]:
                abs_path = os.path.join(settings.storage_path, rel_path)
                try:
                    doc_images.append(_encode_image(abs_path))
                except FileNotFoundError:
                    pass
        else:
            file_path = input_data.get("file_path", "")
            if file_path:
                abs_path = file_path if os.path.isabs(file_path) else os.path.join(settings.storage_path, file_path)
                ext = os.path.splitext(abs_path)[1].lower()
                if ext == ".pdf":
                    step_log(step_id, f"Input is PDF — converting inline (max {MAX_IMAGES} pages)")
                    doc_images = _pdf_to_b64_images(abs_path)
                elif ext in (".png", ".jpg", ".jpeg", ".webp", ".gif"):
                    step_log(step_id, "Input is image — encoding directly")
                    try:
                        doc_images = [_encode_image(abs_path)]
                    except FileNotFoundError:
                        pass

        if doc_images:
            step_log(step_id, f"Attached {len(doc_images)} image(s) to AI request")

        # Serialize structured fields as context for the AI
        context_fields = {k: v for k, v in input_data.items() if k not in ("file_path", "mime_type", "image_paths")}
        context_text = ""
        if context_fields:
            context_text = "\n\nContext from previous steps:\n" + json.dumps(context_fields, indent=2, default=str)

        user_content: list[dict] = [
            {"type": "text", "text": rendered_prompt + context_text},
        ]
        for b64 in doc_images:
            user_content.append(_image_content(b64))

        messages = [{"role": "user", "content": user_content}]

        step_log(step_id, f"Calling OpenRouter → {model}")
        _t0 = time.time()

        client = OpenAI(api_key=api_key, base_url="https://openrouter.ai/api/v1")
        response = client.chat.completions.create(
            model=model,
            messages=messages,  # type: ignore[arg-type]
            max_tokens=4096,
        )

        raw = response.choices[0].message.content or ""
        elapsed = (time.time() - _t0) * 1000

        usage = response.usage
        token_info = f"{usage.prompt_tokens}→{usage.completion_tokens} tokens" if usage else ""
        step_log(step_id, f"Response in {elapsed:.0f}ms {token_info}")
        step_log(step_id, "─── AI RESPONSE ─────────────────────────────────────")
        step_log(step_id, raw[:2000] + ("…" if len(raw) > 2000 else ""))
        step_log(step_id, "─────────────────────────────────────────────────────")

        output = {**input_data, "ai_response": raw}
        mark_step_done(step_id, output)
        return output

    except Exception as exc:
        mark_step_failed(step_id, str(exc))
        mark_run_failed(run_id, str(exc))
        raise
