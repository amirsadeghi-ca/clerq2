"""Execution engine v2 — a durable, database-as-source-of-truth graph scheduler.

The DB is the source of truth for execution state; Celery + Redis are only a
wakeup hint. Two generic tasks drive everything (`execute_step`, `advance_run`)
and a periodic reconciler re-derives work so a dropped message never strands a
run. See docs/workflow-engine-rewrite-plan.md.

Public entry points are re-exported here as they are implemented:
    from app.engine import start_run, signal_event, cancel_run
"""
from app.engine.entry import cancel_run, start_run  # noqa: E402,F401
from app.engine.events import signal_event_tx as signal_event  # noqa: E402,F401
