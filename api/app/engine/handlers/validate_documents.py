"""`validate_documents` handler — the most complex port.

The OUTPUT shape is a hard cross-system contract (cases.py, ReportView.tsx,
ValidationResultsModal.tsx, the Phase-6 review). To keep it byte-identical we
reuse the exact prompt-builder and merge logic from the legacy node module; only
the plumbing (logging→ctx.log, settings→ctx.setting, files→ctx.storage,
cancellation→ctx.check_cancelled) is re-implemented. The single-doc dual path is
gone — everything runs through the `documents` model (ctx.documents()).

Phase-3 note: when the legacy `app.tasks.nodes.validate_documents` is deleted,
move `_build_prompt` / `_merge_per_doc_results` (and their helpers) into the
engine and update the two imports below.
"""
from __future__ import annotations

import json
import time

from openai import OpenAI

from app.config import settings
from app.database import SessionLocal
from app.engine.context import Output, StepContext, StepFailed
from app.engine.handlers._media import encode_image, image_content, pdf_to_b64_images
from app.models.policy import Policy
from app.models.reference_list import ReferenceList
# Reuse the EXACT prompt + merge logic (the output contract).
from app.tasks.nodes.validate_documents import _build_prompt, _merge_per_doc_results

MAX_DOC_IMAGES = 20
MAX_SET_IMAGES = 30
_IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".webp", ".gif")


def _doc_blocks(doc_info: dict, ctx: StepContext, image_budget: int) -> tuple[list[dict], int]:
    """Build OpenAI content blocks for one document. Handles text_content,
    pre-rendered image_paths, and a raw file_path (PDF/image rendered inline).
    Returns (blocks, images_used)."""
    text_content = doc_info.get("text_content")
    if text_content:
        return [{"type": "text", "text": text_content}], 0

    blocks: list[dict] = []
    used = 0
    for rel_path in (doc_info.get("image_paths") or [])[:image_budget]:
        try:
            blocks.append(image_content(encode_image(ctx.storage.abspath(rel_path))))
            used += 1
        except (FileNotFoundError, ValueError):
            pass
    if blocks:
        return blocks, used

    # No pre-rendered pages — render the raw file inline (direct input→validate).
    file_path = doc_info.get("file_path") or ""
    if file_path:
        try:
            abs_path = ctx.storage.abspath(file_path)
        except ValueError:
            abs_path = file_path
        ext = "." + file_path.rsplit(".", 1)[-1].lower() if "." in file_path else ""
        if ext == ".pdf":
            for b64 in pdf_to_b64_images(abs_path, max_pages=image_budget):
                blocks.append(image_content(b64))
                used += 1
        elif ext in _IMAGE_EXTS:
            try:
                blocks.append(image_content(encode_image(abs_path)))
                used += 1
            except (FileNotFoundError, ValueError):
                pass
    return blocks, used


def _set_blocks(documents: list[dict], ctx: StepContext) -> list[dict]:
    """Labeled content blocks for the WHOLE set (cross-set rules), image-capped."""
    blocks: list[dict] = []
    used = 0
    for doc in documents:
        name = doc.get("filename", "document")
        blocks.append({"type": "text", "text": f'=== Document: "{name}" ==='})
        text_content = doc.get("text_content")
        if text_content:
            blocks.append({"type": "text", "text": text_content})
            continue
        budget = MAX_SET_IMAGES - used
        if budget <= 0:
            blocks.append({"type": "text", "text": f'[Pages of "{name}" omitted — set image cap reached]'})
            continue
        doc_blocks, doc_used = _doc_blocks(doc, ctx, budget)
        blocks.extend(doc_blocks)
        used += doc_used
    return blocks


def _call_ai(ctx, client, model, policy, rules, blocks, *, doc_name=None,
             cross_set=False, reference_specs=None) -> list[dict]:
    messages = _build_prompt(policy, rules, blocks, doc_name=doc_name,
                             cross_set=cross_set, reference_specs=reference_specs)
    label = f"for {doc_name}" if doc_name else ("(cross-set)" if cross_set else "")
    ctx.log(f"Calling OpenRouter → {model} {label}")
    t0 = time.time()
    response = client.chat.completions.create(
        model=model, messages=messages, max_tokens=8192, temperature=0.1,
    )
    raw = (response.choices[0].message.content or "{}").strip()
    usage = response.usage
    ctx.log(f"Response in {(time.time() - t0) * 1000:.0f}ms " +
            (f"{usage.prompt_tokens}→{usage.completion_tokens} tokens" if usage else ""))
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw.strip()).get("results", [])


def validate_documents(ctx: StepContext):
    cfg = ctx.config or {}
    policy_id = cfg.get("policy_id")
    fail_on_missing = cfg.get("fail_on_missing", False)
    if not policy_id:
        raise ValueError("validate_documents node requires policy_id in node config")

    # Load policy + rules + samples + reference lists while the session is open,
    # then use the (detached, fully-loaded) objects for the AI calls.
    with SessionLocal() as db:
        policy = db.get(Policy, int(policy_id))
        if not policy or policy.tenant_id != ctx.tenant_id:
            raise ValueError(f"Policy {policy_id} not found")
        # Force-load rules + document_type.samples before detaching.
        _ = [(r.name, r.document_type.samples if r.document_type else []) for r in policy.rules]
        policy_version_num = policy.current_version_num
        policy_name = policy.name
        rule_requirements = {r.name: r.requirement for r in policy.rules}
        rule_scopes = {r.name: getattr(r, "scope", "per_document") for r in policy.rules}
        rule_order = {r.name: r.position for r in policy.rules}
        per_doc_rules = [r for r in policy.rules
                         if getattr(r, "scope", "per_document") in ("per_document", "any_document")]
        cross_set_rules = [r for r in policy.rules
                           if getattr(r, "scope", "per_document") == "cross_set"]
        all_rules = list(policy.rules)
        reference_specs: dict[str, dict] = {}
        for r in policy.rules:
            rl_id = getattr(r, "reference_list_id", None)
            if rl_id:
                rl = db.get(ReferenceList, rl_id)
                if rl:
                    reference_specs[r.name] = {
                        "name": rl.name,
                        "items": list(rl.items or []),
                        "direction": getattr(r, "reference_direction", "in") or "in",
                        "match": getattr(r, "reference_match", "smart") or "smart",
                    }

    api_key = ctx.setting("openrouter_api_key") or settings.openrouter_api_key
    if not api_key:
        raise ValueError("OpenRouter API key not configured. Set it in Settings → OpenRouter.")
    model = cfg.get("model") or ctx.setting("openrouter_default_model") or settings.openrouter_default_model

    ctx.log(f'Policy: "{policy_name}" — {len(all_rules)} rules')
    client = OpenAI(api_key=api_key, base_url="https://openrouter.ai/api/v1", timeout=120.0)

    documents = ctx.documents()
    if not documents:
        raise ValueError("No documents available to validate")
    if not any(d.get("text_content") or d.get("image_paths") or d.get("file_path") for d in documents):
        raise ValueError("No readable content in any document — the file(s) may be "
                         "empty, corrupt, or an unsupported format.")

    all_image_paths = [p for d in documents for p in (d.get("image_paths") or [])]
    primary_doc_id = documents[0].get("id") if documents else None
    results: list[dict] = []

    # ── Per-document rules: one AI call per document, then merge ──
    if per_doc_rules:
        per_doc_results: list[dict] = []
        for doc in documents:
            ctx.check_cancelled()
            doc_id = doc.get("id")
            doc_name = doc.get("filename", f"document {doc_id}")
            blocks, _used = _doc_blocks(doc, ctx, MAX_DOC_IMAGES)
            if not blocks:
                ctx.log(f"  {doc_name}: no readable content, skipping")
                per_doc_results.append({"document_id": doc_id, "document_filename": doc_name, "results": []})
                continue
            ai_results = _call_ai(ctx, client, model, policy, per_doc_rules, blocks,
                                  doc_name=doc_name, reference_specs=reference_specs)
            per_doc_results.append({"document_id": doc_id, "document_filename": doc_name, "results": ai_results})
        results.extend(_merge_per_doc_results(per_doc_results, rule_requirements, rule_scopes))

    # ── Cross-set rules: one AI call over the whole set ──
    if cross_set_rules:
        ctx.check_cancelled()
        set_blocks = _set_blocks(documents, ctx)
        if set_blocks:
            cross = _call_ai(ctx, client, model, policy, cross_set_rules, set_blocks,
                             cross_set=True, reference_specs=reference_specs)
            compared = [{"document_id": d.get("id"),
                         "document_filename": d.get("filename", f"document {d.get('id')}")}
                        for d in documents]
            for r in cross:
                r["scope"] = "cross_set"
                # Authoritative DB requirement (the model leaks free text here).
                r["requirement"] = rule_requirements.get(r.get("rule_name", ""), r.get("requirement", "required"))
                r["per_document"] = [{**c, "status": r.get("status", "uncertain"),
                                      "confidence": r.get("confidence", 0.0), "evidence": ""}
                                     for c in compared]
            results.extend(cross)

    results.sort(key=lambda r: rule_order.get(r.get("rule_name", ""), 9999))

    # Overall: a stray not_applicable on a required rule = missing document → fail.
    required = [("fail" if r["status"] == "not_applicable" else r["status"]) for r in results
                if rule_requirements.get(r.get("rule_name", ""), "required").lower() == "required"]
    if any(s == "fail" for s in required):
        overall = "fail"
    elif any(s == "uncertain" for s in required):
        overall = "needs_review"
    else:
        overall = "pass"

    n_pass = sum(1 for r in results if r.get("status") == "pass")
    n_fail = sum(1 for r in results if r.get("status") == "fail")
    n_unc = sum(1 for r in results if r.get("status") == "uncertain")
    ctx.log(f"Overall: {overall.upper()} — {n_pass} pass / {n_fail} fail / {n_unc} uncertain")

    output = {
        "policy_id": int(policy_id),
        "policy_name": policy_name,
        "policy_version_num": policy_version_num,
        "overall": overall,
        "results": results,
        "image_paths": all_image_paths,
        "document_id": primary_doc_id,
    }

    if fail_on_missing and overall == "fail":
        failed = ", ".join(r["rule_name"] for r in results if r.get("status") == "fail")
        raise StepFailed(f"Validation failed: {failed}", output=output)

    return Output(output)
