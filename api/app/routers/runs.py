from datetime import datetime, UTC

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.document import Document
from app.models.workflow import Workflow
from app.models.workflow_version import WorkflowVersion
from app.models.run import WorkflowRun
from app.schemas.run import RunCreate, RunOut
from app.security import get_current_tenant_id
from app.tasks.executor import trigger_run
from app import cases as cases_svc

router = APIRouter()


@router.post("/", response_model=RunOut, status_code=201)
def create_run(
    body: RunCreate,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    wf = db.get(Workflow, body.workflow_id)
    if not wf or wf.tenant_id != tenant_id:
        raise HTTPException(404, "Workflow not found")
    if wf.is_archived:
        raise HTTPException(400, "Cannot run an archived workflow")
    doc = db.get(Document, body.document_id)
    if not doc or doc.tenant_id != tenant_id:
        raise HTTPException(404, "Document not found")

    latest_version = db.scalar(
        select(WorkflowVersion)
        .where(WorkflowVersion.workflow_id == wf.id)
        .order_by(WorkflowVersion.version_num.desc())
        .limit(1)
    )

    run = WorkflowRun(
        tenant_id=tenant_id,
        workflow_id=wf.id,
        document_id=doc.id,
        status="pending",
        version_id=latest_version.id if latest_version else None,
        version_num=latest_version.version_num if latest_version else None,
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    case = cases_svc.resolve_or_create_case(
        db, tenant_id,
        target_kind="workflow",
        workflow_id=wf.id,
        name=run.name or wf.name,
    )
    cases_svc.attach_run_to_case(db, case, run)
    cases_svc.attach_document_to_case(db, case, doc, source="upload")
    db.commit()

    definition = latest_version.definition if latest_version else wf.definition
    trigger_run(run.id, definition, [doc])
    db.refresh(run)
    return run


@router.get("/", response_model=list[RunOut])
def list_runs(
    workflow_id: int | None = None,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    q = (
        db.query(WorkflowRun)
        .filter(WorkflowRun.tenant_id == tenant_id)
        .order_by(WorkflowRun.created_at.desc())
    )
    if workflow_id:
        q = q.filter(WorkflowRun.workflow_id == workflow_id)
    return q.all()


@router.get("/{run_id}", response_model=RunOut)
def get_run(run_id: int, db: Session = Depends(get_db), tenant_id: int = Depends(get_current_tenant_id)):
    run = db.get(WorkflowRun, run_id)
    if not run or run.tenant_id != tenant_id:
        raise HTTPException(404, "Run not found")
    return run


@router.post("/{run_id}/cancel", response_model=RunOut)
def cancel_run(run_id: int, db: Session = Depends(get_db), tenant_id: int = Depends(get_current_tenant_id)):
    run = db.get(WorkflowRun, run_id)
    if not run or run.tenant_id != tenant_id:
        raise HTTPException(404, "Run not found")
    if run.status not in ("pending", "running"):
        raise HTTPException(400, f"Run is already {run.status}")

    now = datetime.now(UTC)
    run.status = "failed"
    run.error = "Cancelled by user"
    run.completed_at = now

    for step in run.steps:
        if step.status in ("pending", "running"):
            step.status = "failed"
            step.error = "Cancelled by user"
            step.completed_at = now

    db.commit()
    db.refresh(run)
    return run
