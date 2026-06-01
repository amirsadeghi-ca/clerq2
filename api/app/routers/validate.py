from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, model_validator
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.document import Document
from app.models.policy import Policy
from app.models.run import WorkflowRun
from app.schemas.run import RunOut
from app.security import get_current_tenant_id
from app.tasks.executor import trigger_run
from app import cases as cases_svc

router = APIRouter()


class ValidateRunCreate(BaseModel):
    policy_id: int
    document_id: int | None = None
    document_ids: list[int] | None = None

    @model_validator(mode="after")
    def resolve_doc_ids(self):
        if not self.document_ids and self.document_id:
            self.document_ids = [self.document_id]
        if not self.document_ids:
            raise ValueError("document_id or document_ids is required")
        return self


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
def create_validate_run(
    body: ValidateRunCreate,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    policy = db.get(Policy, body.policy_id)
    if not policy or policy.tenant_id != tenant_id:
        raise HTTPException(404, "Policy not found")

    docs: list[Document] = []
    for doc_id in body.document_ids:  # type: ignore[union-attr]
        doc = db.get(Document, doc_id)
        if not doc or doc.tenant_id != tenant_id:
            raise HTTPException(404, f"Document {doc_id} not found")
        docs.append(doc)

    primary_doc = docs[0]
    run_name = primary_doc.original_filename if len(docs) == 1 else f"{len(docs)} documents"

    run = WorkflowRun(
        tenant_id=tenant_id,
        workflow_id=None,
        document_id=primary_doc.id,
        name=run_name,
        source="validate",
        policy_id=policy.id,
        status="pending",
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    case = cases_svc.resolve_or_create_case(
        db, tenant_id,
        target_kind="policy",
        policy_id=policy.id,
        name=run_name,
    )
    cases_svc.attach_run_to_case(db, case, run)
    for doc in docs:
        cases_svc.attach_document_to_case(db, case, doc, source="validate")
    db.commit()
    db.refresh(run)

    trigger_run(run.id, _canonical_definition(policy.id), docs)
    db.refresh(run)
    return run


@router.get("/runs", response_model=list[RunOut])
def list_validate_runs(
    policy_id: int | None = None,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    from sqlalchemy import or_
    q = (
        db.query(WorkflowRun)
        .filter(
            WorkflowRun.tenant_id == tenant_id,
            or_(
                WorkflowRun.source == "validate",
                (WorkflowRun.source == "mail") & (WorkflowRun.policy_id.isnot(None)),
            ),
        )
        .order_by(WorkflowRun.created_at.desc())
    )
    if policy_id:
        q = q.filter(WorkflowRun.policy_id == policy_id)
    return q.all()
