"""`completeness_gate` node — human-in-the-loop / suspend-resume showcase.

Config: ``{"required_doc_types": [<document_type_id>, …], "timeout_days": <n>}``.
Checks the case's active documents; if every required type is present → Output;
otherwise → Suspend until a document is attached (signal_event "document_added")
or the deadline passes (fired by the reconciler), at which point it proceeds
marked `timed_out`. Re-checks on every resume, so it parks for days then continues.
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.database import SessionLocal
from app.engine.context import Output, StepContext, Suspend
from app.models.case import CaseDocument
from app.models.run import WorkflowRun
from app.models.run_step import RunStep


def _utcnow() -> datetime:
    # Local to avoid a circular import (scheduler imports the handler registry).
    return datetime.now(UTC).replace(tzinfo=None)


def completeness_gate(ctx: StepContext):
    cfg = ctx.config or {}
    required = [int(x) for x in (cfg.get("required_doc_types") or [])]
    timeout_days = cfg.get("timeout_days")
    data = dict(ctx.primary_input())

    with SessionLocal() as db:
        run = db.get(WorkflowRun, ctx.run_id)
        case_id = run.case_id if run else None
        step = db.get(RunStep, ctx.step_id)
        first_seen = step.created_at if step else None
        present: set[int] = set()
        if case_id:
            rows = db.query(CaseDocument).filter(
                CaseDocument.case_id == case_id,
                CaseDocument.superseded_by_id.is_(None),
            ).all()
            present = {r.document_type_id for r in rows if r.document_type_id is not None}

    missing = [t for t in required if t not in present]
    if not missing:
        ctx.log("completeness_gate: all required document types present")
        return Output({**data, "complete": True, "missing_doc_types": []})

    # Compute the deadline from when the step was first created. On every resume
    # we re-evaluate: complete → proceed; past deadline → proceed (timed out);
    # else re-park. This naturally handles both wakeup paths (doc-added + timer).
    deadline = None
    if timeout_days is not None and first_seen is not None:
        try:
            deadline = first_seen + timedelta(days=float(timeout_days))
        except (TypeError, ValueError):
            deadline = None

    if deadline is not None and _utcnow() >= deadline:
        ctx.log(f"completeness_gate: timed out, {len(missing)} type(s) still missing")
        return Output({**data, "complete": False, "timed_out": True, "missing_doc_types": missing})

    ctx.log(f"completeness_gate: waiting for {len(missing)} missing document type(s)")
    return Suspend(
        event_type="document_added",
        match_key=str(case_id) if case_id is not None else None,
        fire_at=deadline,
        payload={"missing_doc_types": missing},
    )
