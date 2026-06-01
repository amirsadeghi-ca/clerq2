"""Suspend/resume wakeups.

A suspended step parks as `waiting` and writes an armed `run_events` row. It
resumes when (a) a matching external event fires via `signal_event` (e.g. a new
document attaches to a case) or (b) its timer comes due (fired by the reconciler).
"""
from __future__ import annotations

from app.database import SessionLocal
from app.models.run_step import RunEvent, RunStep
from app.engine.scheduler import _utcnow


def signal_event(db, event_type: str, match_key: str | None = None,
                 payload: dict | None = None) -> list[int]:
    """Fire armed events matching (event_type, match_key) and ready their waiting
    steps. Returns the step ids made ready (caller enqueues execute_step). Caller
    commits."""
    q = db.query(RunEvent).filter(
        RunEvent.event_type == event_type, RunEvent.status == "armed"
    )
    if match_key is not None:
        q = q.filter(RunEvent.match_key == str(match_key))

    ready_ids: list[int] = []
    for ev in q.all():
        ev.status = "fired"
        ev.updated_at = _utcnow()
        if payload:
            ev.payload = {**(ev.payload or {}), **payload}
        step = db.get(RunStep, ev.step_id) if ev.step_id else None
        if step and step.status == "waiting":
            step.status = "ready"
            step.ready_at = _utcnow()
            ready_ids.append(step.id)
    return ready_ids


def signal_event_tx(event_type: str, match_key: str | None = None,
                    payload: dict | None = None) -> list[int]:
    """signal_event in its own transaction."""
    with SessionLocal() as db:
        ids = signal_event(db, event_type, match_key, payload)
        db.commit()
    return ids
