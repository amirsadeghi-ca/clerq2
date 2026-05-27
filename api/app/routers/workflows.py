from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.workflow import Workflow
from app.models.workflow_version import WorkflowVersion
from app.schemas.workflow import WorkflowCreate, WorkflowOut, WorkflowUpdate, WorkflowVersionOut

router = APIRouter()


def _version_out(v: WorkflowVersion) -> WorkflowVersionOut:
    return WorkflowVersionOut(
        id=v.id,
        workflow_id=v.workflow_id,
        version_num=v.version_num,
        definition=v.definition,
        node_count=len((v.definition or {}).get("nodes", [])),
        created_at=v.created_at,
    )


def _make_version(db: Session, workflow_id: int, definition: dict) -> WorkflowVersion:
    next_num = (db.scalar(
        select(func.max(WorkflowVersion.version_num)).where(WorkflowVersion.workflow_id == workflow_id)
    ) or 0) + 1
    v = WorkflowVersion(workflow_id=workflow_id, version_num=next_num, definition=definition)
    db.add(v)
    return v


@router.get("/", response_model=list[WorkflowOut])
def list_workflows(include_archived: bool = False, db: Session = Depends(get_db)):
    q = db.query(Workflow).order_by(Workflow.created_at.desc())
    if not include_archived:
        q = q.filter(Workflow.is_archived == False)  # noqa: E712
    return q.all()


@router.post("/", response_model=WorkflowOut, status_code=201)
def create_workflow(body: WorkflowCreate, db: Session = Depends(get_db)):
    wf = Workflow(name=body.name, description=body.description)
    db.add(wf)
    db.flush()  # get wf.id before creating version

    definition = body.definition.model_dump()
    v = _make_version(db, wf.id, definition)
    db.flush()

    wf.definition = definition
    wf.current_version_num = v.version_num
    db.commit()
    db.refresh(wf)
    return wf


@router.get("/{workflow_id}", response_model=WorkflowOut)
def get_workflow(workflow_id: int, db: Session = Depends(get_db)):
    wf = db.get(Workflow, workflow_id)
    if not wf:
        raise HTTPException(404, "Workflow not found")
    return wf


@router.put("/{workflow_id}", response_model=WorkflowOut)
def update_workflow(workflow_id: int, body: WorkflowUpdate, db: Session = Depends(get_db)):
    wf = db.get(Workflow, workflow_id)
    if not wf:
        raise HTTPException(404, "Workflow not found")
    if wf.is_archived:
        raise HTTPException(400, "Cannot edit an archived workflow")

    if body.name is not None:
        wf.name = body.name
    if body.description is not None:
        wf.description = body.description
    if body.definition is not None:
        definition = body.definition.model_dump()
        v = _make_version(db, workflow_id, definition)
        db.flush()
        wf.definition = definition
        wf.current_version_num = v.version_num

    db.commit()
    db.refresh(wf)
    return wf


@router.post("/{workflow_id}/archive", response_model=WorkflowOut)
def archive_workflow(workflow_id: int, db: Session = Depends(get_db)):
    wf = db.get(Workflow, workflow_id)
    if not wf:
        raise HTTPException(404, "Workflow not found")
    wf.is_archived = True
    db.commit()
    db.refresh(wf)
    return wf


@router.post("/{workflow_id}/unarchive", response_model=WorkflowOut)
def unarchive_workflow(workflow_id: int, db: Session = Depends(get_db)):
    wf = db.get(Workflow, workflow_id)
    if not wf:
        raise HTTPException(404, "Workflow not found")
    wf.is_archived = False
    db.commit()
    db.refresh(wf)
    return wf


@router.post("/{workflow_id}/favorite", response_model=WorkflowOut)
def favorite_workflow(workflow_id: int, db: Session = Depends(get_db)):
    wf = db.get(Workflow, workflow_id)
    if not wf:
        raise HTTPException(404, "Workflow not found")
    wf.is_favorite = True
    db.commit()
    db.refresh(wf)
    return wf


@router.post("/{workflow_id}/unfavorite", response_model=WorkflowOut)
def unfavorite_workflow(workflow_id: int, db: Session = Depends(get_db)):
    wf = db.get(Workflow, workflow_id)
    if not wf:
        raise HTTPException(404, "Workflow not found")
    wf.is_favorite = False
    db.commit()
    db.refresh(wf)
    return wf


@router.post("/{workflow_id}/enable-inbox", response_model=WorkflowOut)
def enable_workflow_inbox(workflow_id: int, db: Session = Depends(get_db)):
    wf = db.get(Workflow, workflow_id)
    if not wf:
        raise HTTPException(404, "Workflow not found")
    wf.email_inbox_enabled = True
    wf.email_address = f"workflow-{workflow_id}@clerq.local"
    db.commit()
    db.refresh(wf)
    return wf


@router.post("/{workflow_id}/disable-inbox", response_model=WorkflowOut)
def disable_workflow_inbox(workflow_id: int, db: Session = Depends(get_db)):
    wf = db.get(Workflow, workflow_id)
    if not wf:
        raise HTTPException(404, "Workflow not found")
    wf.email_inbox_enabled = False
    wf.email_address = None
    db.commit()
    db.refresh(wf)
    return wf


@router.get("/{workflow_id}/versions", response_model=list[WorkflowVersionOut])
def list_versions(workflow_id: int, db: Session = Depends(get_db)):
    wf = db.get(Workflow, workflow_id)
    if not wf:
        raise HTTPException(404, "Workflow not found")
    versions = (
        db.query(WorkflowVersion)
        .filter(WorkflowVersion.workflow_id == workflow_id)
        .order_by(WorkflowVersion.version_num.desc())
        .all()
    )
    return [_version_out(v) for v in versions]


@router.post("/{workflow_id}/versions/{version_id}/restore", response_model=WorkflowOut)
def restore_version(workflow_id: int, version_id: int, db: Session = Depends(get_db)):
    wf = db.get(Workflow, workflow_id)
    if not wf:
        raise HTTPException(404, "Workflow not found")
    if wf.is_archived:
        raise HTTPException(400, "Cannot restore versions on an archived workflow")

    v = db.get(WorkflowVersion, version_id)
    if not v or v.workflow_id != workflow_id:
        raise HTTPException(404, "Version not found")

    new_v = _make_version(db, workflow_id, v.definition)
    db.flush()
    wf.definition = v.definition
    wf.current_version_num = new_v.version_num
    db.commit()
    db.refresh(wf)
    return wf
