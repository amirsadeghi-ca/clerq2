"""Phase 6 — human review on the report (annotate → override → finalize → reopen).

The review state lives in `WorkflowRun.review` (a JSON column). The AI's original
verdict is never erased: overrides are layered on top and the report shows both.
"""
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.database import get_db
from app.models.run import WorkflowRun
from app.schemas.run import FindingAnnotationIn, RunOut
from app.security import get_current_tenant_id

router = APIRouter()


# ── Helpers ────────────────────────────────────────────────────────────────

VALID_OVERRIDE_STATUSES = {"pass", "fail", "uncertain", "not_applicable"}


def _now() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"


def _validate_step_output(run: WorkflowRun) -> dict | None:
    """Return the run's validation output (engine-v2 run.result, else the
    validate_documents step's output_data)."""
    from app.cases import validation_output
    return validation_output(run)


def _ai_results_index(run: WorkflowRun) -> dict[str, dict]:
    """Map rule_name → AI result row from the validate_documents step."""
    out = _validate_step_output(run) or {}
    return {r.get("rule_name"): r for r in (out.get("results") or []) if r.get("rule_name")}


def _compute_overall(run: WorkflowRun, annotations: dict[str, Any]) -> str | None:
    """Recompute the overall verdict using effective statuses (override or AI).

    Mirrors validate_documents.py: any *required* fail → fail; else any required
    uncertain → needs_review; else pass. 'not_applicable' is non-blocking.
    """
    out = _validate_step_output(run)
    if not out:
        return None
    results = out.get("results") or []
    has_fail = False
    has_uncertain = False
    for r in results:
        name = r.get("rule_name", "")
        # Defensive: only "optional" is skipped. The cross-set path can leak
        # the AI's free-text into the `requirement` field; treat anything that
        # isn't explicitly "optional" as required so the verdict stays strict.
        requirement = (r.get("requirement") or "required").strip().lower()
        if requirement == "optional":
            continue
        ann = annotations.get(name) or {}
        override = ann.get("override")
        effective = (override or {}).get("status") if override else r.get("status")
        if effective == "fail":
            has_fail = True
        elif effective == "uncertain":
            has_uncertain = True
    if has_fail:
        return "fail"
    if has_uncertain:
        return "needs_review"
    return "pass"


def _ensure_review(run: WorkflowRun) -> dict:
    """Return the run's review dict, initialising it if absent."""
    if run.review is None:
        run.review = {
            "state": "draft",
            "annotations": {},
            "history": [],
            "finalized_at": None,
            "finalized_by": None,
            "effective_overall": None,
        }
        flag_modified(run, "review")
    # Defensive defaults
    run.review.setdefault("state", "draft")
    run.review.setdefault("annotations", {})
    run.review.setdefault("history", [])
    return run.review


def _append_history(review: dict, action: str, rule_name: str | None, details: dict, by: str | None) -> None:
    review.setdefault("history", []).append({
        "action": action,
        "rule_name": rule_name,
        "details": details,
        "at": _now(),
        "by": by,
    })


def _load_run_or_404(db: Session, run_id: int, tenant_id: int) -> WorkflowRun:
    run = db.get(WorkflowRun, run_id)
    if not run or run.tenant_id != tenant_id:
        raise HTTPException(404, "Run not found")
    return run


# ── Endpoints ──────────────────────────────────────────────────────────────

@router.patch("/{run_id}/review/finding/{rule_name:path}", response_model=RunOut)
def annotate_finding(
    run_id: int,
    rule_name: str,
    body: FindingAnnotationIn,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """Set or clear a note and/or override on a single finding.

    Override status must be one of pass/fail/uncertain/not_applicable. When the
    override status differs from the AI's verdict, a non-empty `override_reason`
    is required so the change is accountable.
    """
    run = _load_run_or_404(db, run_id, tenant_id)

    ai_results = _ai_results_index(run)
    if rule_name not in ai_results:
        raise HTTPException(404, f"Rule '{rule_name}' not found in this run's results")
    ai_status = ai_results[rule_name].get("status")

    review = _ensure_review(run)
    if review.get("state") == "finalized":
        raise HTTPException(409, "Report is finalized; reopen it to amend.")

    annotations = review.setdefault("annotations", {})
    ann = dict(annotations.get(rule_name) or {})

    changed_actions: list[tuple[str, dict]] = []

    # ── Note ──
    if body.clear_note:
        if ann.get("note") is not None:
            changed_actions.append(("note_clear", {"previous": ann.get("note")}))
        ann.pop("note", None)
    elif body.note is not None:
        note = body.note.strip()
        if note:
            if ann.get("note") != note:
                changed_actions.append(("note_set", {"note": note, "previous": ann.get("note")}))
            ann["note"] = note
        else:
            # Empty string treated as clear
            if ann.get("note") is not None:
                changed_actions.append(("note_clear", {"previous": ann.get("note")}))
            ann.pop("note", None)

    # ── Override ──
    if body.clear_override:
        if ann.get("override") is not None:
            changed_actions.append(("override_clear", {"previous": ann.get("override")}))
        ann.pop("override", None)
    elif body.override_status is not None:
        status = body.override_status.strip().lower()
        if status not in VALID_OVERRIDE_STATUSES:
            raise HTTPException(400, f"Invalid override status '{status}'")
        reason = (body.override_reason or "").strip()
        # A reason is required only when the override actually changes the AI verdict.
        if status != ai_status and not reason:
            raise HTTPException(400, "A reason is required when changing the AI verdict.")
        prev = ann.get("override")
        new_ov = {"status": status, "reason": reason}
        if prev != new_ov:
            changed_actions.append(("override_set", {"override": new_ov, "previous": prev, "ai_status": ai_status}))
        ann["override"] = new_ov

    # Stamp + persist
    now = _now()
    ann["updated_at"] = now
    ann["updated_by"] = ann.get("updated_by")  # placeholder for future identity

    if not ann.get("note") and not ann.get("override"):
        annotations.pop(rule_name, None)
    else:
        annotations[rule_name] = ann

    for action, details in changed_actions:
        _append_history(review, action, rule_name, details, by=None)

    review["effective_overall"] = _compute_overall(run, annotations)

    flag_modified(run, "review")
    db.commit()
    db.refresh(run)
    return run


@router.post("/{run_id}/review/finalize", response_model=RunOut)
def finalize_review(
    run_id: int,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    run = _load_run_or_404(db, run_id, tenant_id)
    review = _ensure_review(run)
    if review.get("state") == "finalized":
        return run  # idempotent
    review["state"] = "finalized"
    now = _now()
    review["finalized_at"] = now
    review["finalized_by"] = review.get("finalized_by")  # placeholder
    review["effective_overall"] = _compute_overall(run, review.get("annotations") or {})
    _append_history(review, "finalize", None, {"effective_overall": review["effective_overall"]}, by=None)
    flag_modified(run, "review")
    db.commit()
    db.refresh(run)
    return run


@router.post("/{run_id}/review/reopen", response_model=RunOut)
def reopen_review(
    run_id: int,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    run = _load_run_or_404(db, run_id, tenant_id)
    review = _ensure_review(run)
    if review.get("state") != "finalized":
        return run  # idempotent
    review["state"] = "draft"
    _append_history(review, "reopen", None, {"previous_finalized_at": review.get("finalized_at")}, by=None)
    # Keep finalized_at for audit; clear the active stamp
    review["finalized_at"] = None
    flag_modified(run, "review")
    db.commit()
    db.refresh(run)
    return run
