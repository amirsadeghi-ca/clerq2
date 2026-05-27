from datetime import datetime, UTC
from typing import Any

from app.database import SessionLocal
from app.models.run import WorkflowRun, WorkflowRunStep


def step_log(step_id: int, msg: str) -> None:
    """Append a timestamped log line to the step's logs list."""
    try:
        ts = datetime.now(UTC).strftime("%H:%M:%S.%f")[:-3]
        line = f"[{ts}] {msg}"
        with SessionLocal() as db:
            step = db.get(WorkflowRunStep, step_id)
            if step:
                existing: list = step.logs or []
                step.logs = existing + [line]
                db.commit()
    except Exception:
        pass  # never crash the task due to a log write failure


def mark_step_running(step_id: int) -> None:
    with SessionLocal() as db:
        step = db.get(WorkflowRunStep, step_id)
        if step:
            step.status = "running"
            step.started_at = datetime.now(UTC)
            db.commit()


def mark_step_done(step_id: int, output_data: dict) -> None:
    with SessionLocal() as db:
        step = db.get(WorkflowRunStep, step_id)
        if step:
            step.status = "completed"
            step.output_data = output_data
            step.completed_at = datetime.now(UTC)
            db.commit()


def mark_step_failed(step_id: int, error: str) -> None:
    with SessionLocal() as db:
        step = db.get(WorkflowRunStep, step_id)
        if step:
            step.status = "failed"
            step.error = error
            step.completed_at = datetime.now(UTC)
            db.commit()


def mark_run_running(run_id: int) -> None:
    with SessionLocal() as db:
        run = db.get(WorkflowRun, run_id)
        if run:
            run.status = "running"
            run.started_at = datetime.now(UTC)
            db.commit()


def mark_run_done(run_id: int) -> None:
    with SessionLocal() as db:
        run = db.get(WorkflowRun, run_id)
        if run:
            run.status = "completed"
            run.completed_at = datetime.now(UTC)
            db.commit()


def mark_run_failed(run_id: int, error: str) -> None:
    with SessionLocal() as db:
        run = db.get(WorkflowRun, run_id)
        if run:
            run.status = "failed"
            run.error = error
            run.completed_at = datetime.now(UTC)
            db.commit()


def raise_if_cancelled(run_id: int) -> None:
    """Raise if the run was cancelled so the Celery chain stops cleanly."""
    with SessionLocal() as db:
        run = db.get(WorkflowRun, run_id)
        if run and run.status == "failed":
            raise RuntimeError("Run was cancelled")
