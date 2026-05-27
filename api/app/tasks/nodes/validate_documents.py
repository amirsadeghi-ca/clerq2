import base64
import json
import os
import time

import fitz  # pymupdf
from openai import OpenAI

from app.config import settings
from app.database import SessionLocal
from app.models.policy import Policy
from app.models.setting import AppSetting
from app.tasks.celery_app import celery_app
from app.tasks.nodes.base import mark_step_running, mark_step_done, mark_step_failed, mark_run_failed, step_log, raise_if_cancelled

MAX_DOC_IMAGES = 20
MAX_SAMPLE_IMAGES = 2


def _encode_image(path: str) -> str:
    """Encode image as JPEG for smaller payload. Converts PNG/WebP/etc via fitz."""
    ext = os.path.splitext(path)[1].lower()
    if ext in (".jpg", ".jpeg"):
        with open(path, "rb") as f:
            return base64.b64encode(f.read()).decode("utf-8")
    pix = fitz.Pixmap(path)
    if pix.n > 3:  # strip alpha channel — JPEG doesn't support it
        pix = fitz.Pixmap(fitz.csRGB, pix)
    return base64.b64encode(pix.tobytes("jpeg", jpg_quality=85)).decode("utf-8")


def _image_content(b64: str, media_type: str = "image/jpeg") -> dict:
    return {
        "type": "image_url",
        "image_url": {"url": f"data:{media_type};base64,{b64}"},
    }


def _pdf_to_b64_images(pdf_path: str, max_pages: int = 20, scale: float = 2.0) -> list[str]:
    result = []
    doc = fitz.open(pdf_path)
    for i, page in enumerate(doc):
        if i >= max_pages:
            break
        mat = fitz.Matrix(scale, scale)
        pix = page.get_pixmap(matrix=mat)
        result.append(base64.b64encode(pix.tobytes("jpeg", jpg_quality=85)).decode("utf-8"))
    return result


def _build_prompt(policy: Policy, doc_images: list[str]) -> list[dict]:
    """Build the OpenAI messages list for the validation call."""
    rules_text = []
    sample_sections = []
    for i, rule in enumerate(policy.rules, 1):
        req = rule.requirement.upper()
        line = f"{i}. [{req}] {rule.name}"
        if rule.accept_criteria:
            line += f"\n   Accept when: {rule.accept_criteria}"
        if rule.fail_criteria:
            line += f"\n   Fail when: {rule.fail_criteria}"
        if rule.ai_instructions:
            line += f"\n   Instructions: {rule.ai_instructions}"
        rules_text.append(line)

        if rule.document_type and rule.document_type.samples:
            samples = rule.document_type.samples[:MAX_SAMPLE_IMAGES]
            sample_sections.append({
                "rule_name": rule.name,
                "samples": samples,
            })

    system_msg = {
        "role": "system",
        "content": (
            "You are a document validation AI. You will be shown images of a document packet "
            "and a list of validation rules. Carefully examine ALL images and respond ONLY with "
            "a valid JSON object matching this exact schema:\n"
            '{"results": [{"rule_name": str, "requirement": str, "status": "pass"|"fail"|"uncertain", '
            '"confidence": float (0.0-1.0), "evidence": str, "extracted": {}}]}\n'
            "Do not include any text outside the JSON object.\n\n"
            "CRITICAL — evidence field format:\n"
            "The evidence string MUST explicitly state (1) what the rule requires or forbids, "
            "and (2) what you actually observed in the document. "
            'Example for a failing rule: "This rule requires a government-issued photo ID from outside Québec. '
            "The document is a 'Permis de conduire' issued by Québec, which does not meet this requirement.\" "
            'Example for a passing rule: "This rule requires a valid expiry date. '
            "The document shows an expiry date of 2028-06-15, which is in the future.\" "
            "Always contrast the expectation against the finding — never write evidence that only describes "
            "what you saw without referencing what the rule demands."
        ),
    }

    user_content: list[dict] = [
        {
            "type": "text",
            "text": (
                f"POLICY: {policy.name}\n\n"
                f"BRIEF:\n{policy.brief}\n\n"
                f"RULES TO VALIDATE:\n" + "\n".join(rules_text) + "\n\n"
                "The following images are the document packet pages to validate:"
            ),
        }
    ]

    for b64 in doc_images:
        user_content.append(_image_content(b64))

    if sample_sections:
        user_content.append({
            "type": "text",
            "text": "\n\nREFERENCE SAMPLES (for document type recognition):",
        })
        for section in sample_sections:
            user_content.append({
                "type": "text",
                "text": f'Reference samples for "{section["rule_name"]}":',
            })
            for sample in section["samples"]:
                try:
                    b64 = _encode_image(sample.file_path)
                    user_content.append(_image_content(b64))
                except FileNotFoundError:
                    pass

    return [system_msg, {"role": "user", "content": user_content}]


@celery_app.task(name="nodes.validate_documents", bind=True)
def validate_documents_task(self, input_data: dict, run_id: int, step_id: int, node_config: dict | None = None) -> dict:
    mark_step_running(step_id)
    try:
        raise_if_cancelled(run_id)
        cfg = node_config or {}
        policy_id = cfg.get("policy_id")
        fail_on_missing = cfg.get("fail_on_missing", False)

        if not policy_id:
            raise ValueError("validate_documents node requires policy_id in node config")

        image_paths: list[str] = input_data.get("image_paths", [])

        db = SessionLocal()
        try:
            api_key_row = db.get(AppSetting, "openrouter_api_key")
            model_row = db.get(AppSetting, "openrouter_default_model")
            policy = db.get(Policy, int(policy_id))
            if not policy:
                raise ValueError(f"Policy {policy_id} not found")
            _ = [(r.name, r.document_type.samples if r.document_type else []) for r in policy.rules]
            policy_version_num = policy.current_version_num
            # Build lookup so overall calculation uses stored requirements, not AI-echoed text
            rule_requirements = {r.name: r.requirement for r in policy.rules}
        finally:
            db.close()

        api_key = (api_key_row.value if api_key_row else None) or settings.openrouter_api_key

        if not api_key:
            raise ValueError("OpenRouter API key not configured. Set it in Settings → OpenRouter.")

        default_model = (model_row.value if model_row else None) or settings.openrouter_default_model
        model = cfg.get("model") or default_model

        step_log(step_id, f"Policy: \"{policy.name}\" — {len(policy.rules)} rules")

        # Build document images — prefer image_paths from pdf_to_images; fall back to direct file
        doc_images: list[str] = []

        if image_paths:
            for rel_path in image_paths[:MAX_DOC_IMAGES]:
                abs_path = os.path.join(settings.storage_path, rel_path)
                try:
                    doc_images.append(_encode_image(abs_path))
                except FileNotFoundError:
                    pass
        else:
            file_path = input_data.get("file_path", "")
            if file_path:
                # file_path may be absolute (from ingest node) or relative to storage_path
                abs_path = file_path if os.path.isabs(file_path) else os.path.join(settings.storage_path, file_path)
                ext = os.path.splitext(abs_path)[1].lower()
                if ext == ".pdf":
                    step_log(step_id, f"Input is PDF — converting inline (max {MAX_DOC_IMAGES} pages)")
                    doc_images = _pdf_to_b64_images(abs_path, max_pages=MAX_DOC_IMAGES)
                elif ext in (".png", ".jpg", ".jpeg", ".webp", ".gif"):
                    step_log(step_id, "Input is image — encoding directly")
                    try:
                        doc_images = [_encode_image(abs_path)]
                    except FileNotFoundError:
                        pass

        if not doc_images:
            raise ValueError("No document images available to validate")

        total_mb = sum(len(img) * 3 // 4 for img in doc_images) / (1024 * 1024)
        step_log(step_id, f"Encoded {len(doc_images)} image(s) — {total_mb:.1f} MB total")
        if total_mb > 28:
            raise ValueError(
                f"Document images total {total_mb:.1f} MB, exceeding OpenRouter's 30 MB limit. "
                "Reduce the PDF→Images scale (try 1.5 or 1.0) or use a shorter document."
            )

        # Count sample sections for logging
        sample_section_count = sum(
            1 for rule in policy.rules
            if rule.document_type and rule.document_type.samples
        )
        if sample_section_count:
            step_log(step_id, f"Attached reference samples for {sample_section_count} rule(s)")

        messages = _build_prompt(policy, doc_images)

        # Log prompt structure (images replaced with size placeholders)
        step_log(step_id, "─── PROMPT ──────────────────────────────────────────")
        for msg in messages:
            role = msg.get("role", "?").upper()
            content = msg.get("content", "")
            if isinstance(content, str):
                step_log(step_id, f"[{role}] {content}")
            elif isinstance(content, list):
                for item in content:
                    if item.get("type") == "text":
                        step_log(step_id, f"[{role}] {item['text']}")
                    elif item.get("type") == "image_url":
                        url = item.get("image_url", {}).get("url", "")
                        kb = len(url) * 3 // 4 // 1024
                        step_log(step_id, f"[{role}] [Image ~{kb}KB base64]")
        step_log(step_id, "─────────────────────────────────────────────────────")

        step_log(step_id, f"Calling OpenRouter → {model}")
        _t0 = time.time()

        client = OpenAI(
            api_key=api_key,
            base_url="https://openrouter.ai/api/v1",
            timeout=120.0,
        )
        response = client.chat.completions.create(
            model=model,
            messages=messages,  # type: ignore[arg-type]
            max_tokens=2048,
            temperature=0.1,
        )

        raw = response.choices[0].message.content or "{}"
        elapsed = (time.time() - _t0) * 1000

        # Log raw response
        usage = response.usage
        token_info = f"{usage.prompt_tokens}→{usage.completion_tokens} tokens" if usage else ""
        step_log(step_id, f"Response in {elapsed:.0f}ms {token_info}")
        step_log(step_id, "─── RESPONSE ────────────────────────────────────────")
        step_log(step_id, raw)
        step_log(step_id, "─────────────────────────────────────────────────────")

        # Strip markdown code fences if model wraps response
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        parsed = json.loads(raw.strip())

        results: list[dict] = parsed.get("results", [])

        # Compute overall using stored policy requirements — AI echoes unreliable text here
        required_statuses = [
            r["status"] for r in results
            if rule_requirements.get(r.get("rule_name", ""), "required").lower() == "required"
        ]
        if any(s == "fail" for s in required_statuses):
            overall = "fail"
        elif any(s == "uncertain" for s in required_statuses):
            overall = "needs_review"
        else:
            overall = "pass"

        n_pass = sum(1 for r in results if r.get("status") == "pass")
        n_fail = sum(1 for r in results if r.get("status") == "fail")
        n_unc  = sum(1 for r in results if r.get("status") == "uncertain")
        step_log(step_id, f"Overall: {overall.upper()} — {n_pass} pass / {n_fail} fail / {n_unc} uncertain")

        output = {
            "policy_id": policy.id,
            "policy_name": policy.name,
            "policy_version_num": policy_version_num,
            "overall": overall,
            "results": results,
            # Pass image_paths through so downstream nodes (output) can still access them
            "image_paths": image_paths,
            "document_id": input_data.get("document_id"),
        }

        if fail_on_missing and overall == "fail":
            failed_rules = [r["rule_name"] for r in results if r.get("status") == "fail"]
            mark_step_done(step_id, output)
            mark_run_failed(run_id, f"Validation failed: {', '.join(failed_rules)}")
            return output

        mark_step_done(step_id, output)
        return output

    except Exception as exc:
        mark_step_failed(step_id, str(exc))
        mark_run_failed(run_id, str(exc))
        raise
