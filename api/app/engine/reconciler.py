"""The reconciler (sweeper) — the safety net that guarantees no run is stuck.

Run periodically by Celery beat (~every 10s). Re-derives work from the DB so a
dropped queue message, a worker that died mid-step, or a due timer never strands
a run. Everything it does is idempotent (the claim CAS dedups re-enqueues).
"""
from __future__ import annotations

from app.database import SessionLocal
from app.engine.scheduler import _utcnow
from app.models.run_step import RunEvent, RunStep


def reclaim_expired_leases(db) -> list[int]:
    """A `running` step whose lease expired (worker died) → back to `ready`."""
    now = _utcnow()
    rows = db.query(RunStep).filter(
        RunStep.status == "running",
        RunStep.lease_expires_at.isnot(None),
        RunStep.lease_expires_at < now,
    ).all()
    ids = []
    for s in rows:
        s.status = "ready"
        s.ready_at = now
        s.lease_owner = None
        s.lease_expires_at = None
        ids.append(s.id)
    return ids


def fire_due_timers(db) -> list[int]:
    """Armed timer events whose `fire_at` has passed → ready their waiting step."""
    now = _utcnow()
    rows = db.query(RunEvent).filter(
        RunEvent.status == "armed",
        RunEvent.fire_at.isnot(None),
        RunEvent.fire_at <= now,
    ).all()
    ids = []
    for ev in rows:
        ev.status = "fired"
        ev.updated_at = now
        step = db.get(RunStep, ev.step_id) if ev.step_id else None
        if step and step.status == "waiting":
            step.status = "ready"
            step.ready_at = now
            ids.append(step.id)
    return ids


def find_stranded_ready(db) -> list[int]:
    """All `ready` steps — re-enqueuing them covers any lost wakeup message.
    Safe: the claim CAS makes a duplicate execute_step a no-op."""
    return [s.id for s in db.query(RunStep).filter(RunStep.status == "ready").all()]


def sweep() -> list[int]:
    """One reconciler pass. Returns step ids to (re)enqueue execute_step for."""
    ids: set[int] = set()
    with SessionLocal() as db:
        ids.update(reclaim_expired_leases(db))
        ids.update(fire_due_timers(db))
        db.commit()
    with SessionLocal() as db:
        ids.update(find_stranded_ready(db))
    return list(ids)
