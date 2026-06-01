"""Celery tasks driving the engine. They are thin wrappers around the pure
scheduler functions: the queue is only a wakeup hint, the DB is truth.

`execute_step` runs one step; `advance_run` re-derives the run and enqueues the
next ready steps. Both are safe under duplicate delivery (claim CAS + advisory
lock). `acks_late` + the reconciler (Phase 1) recover from a worker dying mid-step.
"""
from __future__ import annotations

from app.database import SessionLocal
from app.engine import scheduler
from app.models.run_step import RunStep
from app.tasks.celery_app import celery_app


@celery_app.task(name="engine.execute_step", bind=True, acks_late=True)
def execute_step(self, step_id: int) -> None:
    worker_id = self.request.id or "worker"
    run_id = scheduler.process_step(step_id, worker_id)
    if run_id is None:
        return  # lost the claim race / not ready — no-op
    # A retried step was put back to 'ready' by fail_step; re-enqueue it.
    with SessionLocal() as db:
        st = db.get(RunStep, step_id)
        retried = bool(st and st.status == "ready")
    if retried:
        execute_step.delay(step_id)
    advance_run.delay(run_id)


@celery_app.task(name="engine.advance_run", bind=True)
def advance_run(self, run_id: int) -> None:
    for sid in scheduler.advance_run_tx(run_id):
        execute_step.delay(sid)


@celery_app.task(name="engine.sweep")
def sweep() -> None:
    """Reconciler pass (run by beat ~every 10s): requeue expired leases, fire due
    timers, re-derive stranded ready steps. The safety net for lost wakeups."""
    from app.engine.reconciler import sweep as _sweep
    for sid in _sweep():
        execute_step.delay(sid)


@celery_app.task(name="engine.signal_event")
def signal_event(event_type: str, match_key: str | None = None,
                 payload: dict | None = None) -> None:
    """Resume steps waiting on an external event (e.g. a document attached)."""
    from app.engine.events import signal_event_tx
    for sid in signal_event_tx(event_type, match_key, payload):
        execute_step.delay(sid)
