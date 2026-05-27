from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.document import Document
from app.models.policy import Policy
from app.models.run import WorkflowRun
from app.schemas.run import RunOut
from app.tasks.executor import trigger_run

router = APIRouter()


class ValidateRunCreate(BaseModel):
    policy_id: int
    document_id: int


def _canonical_definition(policy_id: int) -> dict:
    return {
        "nodes": [
            {"id": "v_input",    "type": "input",              "data": {},                          "position": {"x": 0, "y": 0}},
            {"id": "v_pdf",      "type": "pdf_to_images",      "data": {"scale": 2.0},              "position": {"x": 0, "y": 100}},
            {"id": "v_validate", "type": "validate_documents", "data": {"policy_id": policy_id},    "position": {"x": 0, "y": 200}},
            {"id": "v_results",  "type": "show_results",       "data": {},                          "position": {"x": 0, "y": 300}},
        ],
        "edges": [
            {"id": "ve1", "source": "v_input",    "target": "v_pdf"},
            {"id": "ve2", "source": "v_pdf",      "target": "v_validate"},
            {"id": "ve3", "source": "v_validate", "target": "v_results"},
        ],
    }


@router.post("/run", response_model=RunOut, status_code=201)
def create_validate_run(body: ValidateRunCreate, db: Session = Depends(get_db)):
    policy = db.get(Policy, body.policy_id)
    if not policy:
        raise HTTPException(404, "Policy not found")

    doc = db.get(Document, body.document_id)
    if not doc:
        raise HTTPException(404, "Document not found")

    run = WorkflowRun(
        workflow_id=0,  # sentinel: 0 = no backing workflow (validate-section runs)
        document_id=doc.id,
        name=doc.original_filename,
        source="validate",
        policy_id=policy.id,
        status="pending",
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    trigger_run(run.id, _canonical_definition(policy.id), doc)
    db.refresh(run)
    return run


@router.get("/runs", response_model=list[RunOut])
def list_validate_runs(policy_id: int | None = None, db: Session = Depends(get_db)):
    from sqlalchemy import or_
    q = (
        db.query(WorkflowRun)
        .filter(
            or_(
                WorkflowRun.source == "validate",
                # mail-triggered runs that targeted a policy inbox
                (WorkflowRun.source == "mail") & (WorkflowRun.policy_id.isnot(None)),
            )
        )
        .order_by(WorkflowRun.created_at.desc())
    )
    if policy_id:
        q = q.filter(WorkflowRun.policy_id == policy_id)
    return q.all()
