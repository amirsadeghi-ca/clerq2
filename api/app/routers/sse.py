import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException
from sse_starlette.sse import EventSourceResponse
from sqlalchemy.orm import Session

from app.database import get_db, SessionLocal
from app.models.run import WorkflowRun

router = APIRouter()


async def run_event_generator(run_id: int):
    last_seen_statuses: dict[int, str] = {}

    for _ in range(300):  # max ~5 min at 1s interval
        db: Session = SessionLocal()
        try:
            run = db.get(WorkflowRun, run_id)
            if not run:
                break

            steps_data = []
            for step in run.steps:
                steps_data.append({
                    "id": step.id,
                    "node_id": step.node_id,
                    "node_type": step.node_type,
                    "status": step.status,
                    "error": step.error,
                    "started_at": step.started_at.isoformat() if step.started_at else None,
                    "completed_at": step.completed_at.isoformat() if step.completed_at else None,
                    "output_data": step.output_data,
                    "logs": step.logs or [],
                })

            payload = {
                "run_id": run.id,
                "status": run.status,
                "error": run.error,
                "steps": steps_data,
            }
            yield {"event": "update", "data": json.dumps(payload)}

            if run.status in ("completed", "failed"):
                yield {"event": "done", "data": json.dumps({"run_id": run.id, "status": run.status})}
                break
        finally:
            db.close()

        await asyncio.sleep(1)


@router.get("/{run_id}/stream")
async def stream_run(run_id: int, db: Session = Depends(get_db)):
    run = db.get(WorkflowRun, run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    return EventSourceResponse(run_event_generator(run_id))
