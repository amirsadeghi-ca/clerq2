"""`ai` node — generic vision/LLM call. Renders {{templates}} against the merged
upstream input, attaches document images, calls OpenRouter via ctx.setting."""
from __future__ import annotations

import json
import time

from openai import OpenAI

from app.config import settings
from app.engine.context import Output, StepContext
from app.engine.handlers._media import encode_image, image_content, pdf_to_b64_images
from app.tasks.nodes.template import render_template

MAX_IMAGES = 20
_IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".webp", ".gif")


def ai_node(ctx: StepContext) -> Output:
    cfg = ctx.config or {}
    system_prompt = (cfg.get("system_prompt") or "").strip()
    if not system_prompt:
        raise ValueError("AI node requires a system_prompt in node config")

    api_key = ctx.setting("openrouter_api_key") or settings.openrouter_api_key
    if not api_key:
        raise ValueError("OpenRouter API key not configured. Set it in Settings → OpenRouter.")
    model = cfg.get("model") or ctx.setting("openrouter_default_model") or settings.openrouter_default_model

    data = ctx.primary_input()
    rendered = render_template(system_prompt, data)

    # Collect images: prefer rendered image_paths (from documents), else a raw file.
    docs = ctx.documents()
    image_paths = [p for d in docs for p in (d.get("image_paths") or [])] or data.get("image_paths", [])
    doc_images: list[str] = []
    if image_paths:
        for rel in image_paths[:MAX_IMAGES]:
            try:
                doc_images.append(encode_image(ctx.storage.abspath(rel)))
            except (FileNotFoundError, ValueError):
                pass
    else:
        file_path = (docs[0].get("file_path") if docs else None) or data.get("file_path") or ""
        if file_path:
            try:
                abs_path = ctx.storage.abspath(file_path)
            except ValueError:
                abs_path = file_path
            ext = "." + file_path.rsplit(".", 1)[-1].lower() if "." in file_path else ""
            if ext == ".pdf":
                doc_images = pdf_to_b64_images(abs_path, max_pages=MAX_IMAGES)
            elif ext in _IMAGE_EXTS:
                try:
                    doc_images = [encode_image(abs_path)]
                except (FileNotFoundError, ValueError):
                    pass

    if doc_images:
        ctx.log(f"Attached {len(doc_images)} image(s) to AI request")

    context_fields = {k: v for k, v in data.items()
                      if k not in ("file_path", "mime_type", "image_paths", "documents")}
    context_text = ""
    if context_fields:
        context_text = "\n\nContext from previous steps:\n" + json.dumps(context_fields, indent=2, default=str)

    user_content: list[dict] = [{"type": "text", "text": rendered + context_text}]
    user_content.extend(image_content(b) for b in doc_images)

    ctx.log(f"Calling OpenRouter → {model}")
    t0 = time.time()
    client = OpenAI(api_key=api_key, base_url="https://openrouter.ai/api/v1")
    response = client.chat.completions.create(
        model=model, messages=[{"role": "user", "content": user_content}], max_tokens=4096,
    )
    raw = response.choices[0].message.content or ""
    ctx.log(f"Response in {(time.time() - t0) * 1000:.0f}ms")
    return Output({**data, "ai_response": raw})
