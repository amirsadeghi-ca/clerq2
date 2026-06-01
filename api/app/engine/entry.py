"""The single entry point all run-creating call sites use (replaces
`executor.trigger_run`). Materializes the run graph, commits, then enqueues
execute_step for the ready roots (commit-before-enqueue)."""
from __future__ import annotations

from app.engine import scheduler


def start_run(db, *, tenant_id: int, run_id: int, definition: dict,
              documents, context_overrides: dict | None = None) -> list[int]:
    ready = scheduler.start_run(
        db,
        tenant_id=tenant_id,
        run_id=run_id,
        definition=definition,
        documents=documents,
        context_overrides=context_overrides,
    )
    if ready:
        # Imported lazily so the API process doesn't pull in Celery at import time.
        from app.engine.tasks import execute_step
        for sid in ready:
            execute_step.delay(sid)
    return ready


def cancel_run(db, run_id: int) -> None:
    scheduler.cancel_run(db, run_id)
