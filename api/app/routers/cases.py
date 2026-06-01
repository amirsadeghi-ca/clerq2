from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import desc, or_
from sqlalchemy.orm import Session, joinedload

from app.cases import (
    attach_document_to_case,
    attach_run_to_case,
    compute_checklist,
    current_document_ids,
    ensure_case_email_token,
    resolve_or_create_case,
)
from app.config import settings as app_settings
from app.database import get_db
from app.mailer import send_email
from app.models.case import Case, CaseDocument
from app.models.document import Document
from app.models.mail import MailMessage
from app.models.run import WorkflowRun
from app.schemas.run import RunOut
from app.security import get_current_tenant_id
from app.tasks.executor import trigger_run

router = APIRouter()


# --- Schemas ---

class CaseCreate(BaseModel):
    name: str | None = None
    target_kind: str | None = None
    policy_id: int | None = None
    workflow_id: int | None = None
    contact_email: str | None = None
    contact_name: str | None = None
    external_ref: str | None = None


class CasePatch(BaseModel):
    name: str | None = None
    status: str | None = None
    contact_email: str | None = None
    contact_name: str | None = None
    external_ref: str | None = None


class CaseDocumentAttach(BaseModel):
    document_ids: list[int]


class CaseRunCreate(BaseModel):
    policy_id: int | None = None  # override; defaults to case.policy_id
    workflow_id: int | None = None


class CaseReply(BaseModel):
    body: str
    subject: str | None = None


class CaseNote(BaseModel):
    body: str


def _target_name(db: Session, case: Case) -> str | None:
    if case.target_kind == "policy" and case.policy_id:
        from app.models.policy import Policy
        p = db.get(Policy, case.policy_id)
        return p.name if p else None
    if case.target_kind == "workflow" and case.workflow_id:
        from app.models.workflow import Workflow
        w = db.get(Workflow, case.workflow_id)
        return w.name if w else None
    return None


def _last_result(run: WorkflowRun | None) -> dict | None:
    if not run:
        return None
    for step in (run.steps or []):
        if step.node_type == "validate_documents" and step.status == "completed" and step.output_data:
            return {
                "kind": "verdict",
                "overall": step.output_data.get("overall"),
                "policy_name": step.output_data.get("policy_name"),
            }
    return {"kind": "run", "status": run.status}


def _checklist_progress(checklist: list[dict]) -> str | None:
    if not checklist:
        return None
    satisfied = sum(1 for c in checklist if c["status"] == "satisfied")
    return f"{satisfied}/{len(checklist)}"


def _serialize_case_list_item(db: Session, case: Case) -> dict:
    # Get latest run
    latest_run = (
        db.query(WorkflowRun)
        .filter(WorkflowRun.case_id == case.id)
        .order_by(desc(WorkflowRun.created_at))
        .first()
    )
    # Count docs
    doc_count = db.query(CaseDocument).filter(
        CaseDocument.case_id == case.id, CaseDocument.superseded_by_id.is_(None)
    ).count()
    # Unread: latest activity is inbound mail
    latest_msg = (
        db.query(MailMessage)
        .filter(MailMessage.case_id == case.id)
        .order_by(desc(MailMessage.created_at))
        .first()
    )
    unread = bool(latest_msg and latest_msg.direction == "inbound")
    checklist = compute_checklist(db, case)
    return {
        "id": case.id,
        "name": case.name,
        "status": case.status,
        "target_kind": case.target_kind,
        "target_name": _target_name(db, case),
        "policy_id": case.policy_id,
        "workflow_id": case.workflow_id,
        "contact_email": case.contact_email,
        "contact_name": case.contact_name,
        "external_ref": case.external_ref,
        "last_result": _last_result(latest_run),
        "checklist_progress": _checklist_progress(checklist),
        "doc_count": doc_count,
        "unread": unread,
        "last_activity_at": case.last_activity_at.isoformat() if case.last_activity_at else None,
        "created_at": case.created_at.isoformat() if case.created_at else None,
    }


def _serialize_case_detail(db: Session, case: Case) -> dict:
    base = _serialize_case_list_item(db, case)
    checklist = compute_checklist(db, case)
    # Build timeline: merge mail + runs, sorted by created_at
    timeline = []
    for msg in db.query(MailMessage).filter(MailMessage.case_id == case.id).order_by(MailMessage.created_at).all():
        timeline.append({
            "kind": "email",
            "id": msg.id,
            "direction": msg.direction,
            "from_addr": msg.from_addr,
            "to_addr": msg.to_addr,
            "subject": msg.subject,
            "body": msg.body,
            "document_id": msg.document_id,
            "run_id": msg.run_id,
            "created_at": msg.created_at.isoformat() if msg.created_at else None,
        })
    for run in db.query(WorkflowRun).filter(WorkflowRun.case_id == case.id).order_by(WorkflowRun.created_at).all():
        step_data = []
        for step in run.steps:
            step_data.append({
                "id": step.id,
                "node_type": step.node_type,
                "status": step.status,
                "output_data": step.output_data,
                "started_at": step.started_at.isoformat() if step.started_at else None,
                "completed_at": step.completed_at.isoformat() if step.completed_at else None,
            })
        timeline.append({
            "kind": "run",
            "id": run.id,
            "name": run.name,
            "status": run.status,
            "source": run.source,
            "policy_id": run.policy_id,
            "version_num": run.version_num,
            "steps": step_data,
            "last_result": _last_result(run),
            "review": run.review,
            "created_at": run.created_at.isoformat() if run.created_at else None,
            "completed_at": run.completed_at.isoformat() if run.completed_at else None,
        })
    timeline.sort(key=lambda x: x.get("created_at") or "")
    # Current documents
    docs = []
    cd_rows = (
        db.query(CaseDocument)
        .filter(CaseDocument.case_id == case.id, CaseDocument.superseded_by_id.is_(None))
        .order_by(CaseDocument.position)
        .all()
    )
    for cd in cd_rows:
        doc = db.get(Document, cd.document_id)
        if doc:
            docs.append({
                "id": doc.id,
                "original_filename": doc.original_filename,
                "mime_type": doc.mime_type,
                "size_bytes": doc.size_bytes,
                "source": cd.source,
                "added_at": cd.added_at.isoformat() if cd.added_at else None,
            })
    # Email token for reply-to construction
    email_token = None
    for alias in (case.aliases or []):
        if alias.alias_type == "email_token":
            email_token = alias.alias_value
            break
    return {
        **base,
        "checklist": checklist,
        "timeline": timeline,
        "documents": docs,
        "email_token": email_token,
        "closed_at": case.closed_at.isoformat() if case.closed_at else None,
    }


# --- Endpoints ---

@router.get("/", response_model=list[dict])
def list_cases(
    view: str | None = Query(None),
    status: str | None = Query(None),
    target: str | None = Query(None),
    q: str | None = Query(None),
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    query = db.query(Case).filter(Case.tenant_id == tenant_id)

    if status:
        query = query.filter(Case.status == status)
    elif view == "needs_review":
        query = query.filter(Case.status == "under_review")
    elif view == "awaiting_applicant":
        query = query.filter(Case.status == "awaiting_applicant")
    elif view == "failed":
        # Cases whose latest run is failed — approximate via status
        query = query.filter(Case.status == "open")
    elif view == "closed":
        query = query.filter(Case.status.in_(["closed_accepted", "closed_rejected"]))
    elif view != "all":
        # Default "interesting" filter: has mail OR more than one run OR not trivially closed
        from sqlalchemy import select, exists
        has_mail = exists().where(MailMessage.case_id == Case.id)
        has_multi_run = (
            select(WorkflowRun.id)
            .where(WorkflowRun.case_id == Case.id)
            .limit(2)
            .correlate(Case)
        )
        query = query.filter(
            or_(
                has_mail,
                Case.status.notin_(["closed_accepted", "closed_rejected"]),
            )
        )

    if target:
        query = query.filter(Case.target_kind == target)

    if q:
        like = f"%{q}%"
        query = query.filter(
            or_(
                Case.contact_email.ilike(like),
                Case.contact_name.ilike(like),
                Case.name.ilike(like),
                Case.external_ref.ilike(like),
            )
        )

    cases = query.order_by(desc(Case.last_activity_at)).all()
    return [_serialize_case_list_item(db, c) for c in cases]


@router.post("/", response_model=dict, status_code=201)
def create_case(
    body: CaseCreate,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    case = resolve_or_create_case(
        db,
        tenant_id,
        target_kind=body.target_kind,
        policy_id=body.policy_id,
        workflow_id=body.workflow_id,
        contact_email=body.contact_email,
        contact_name=body.contact_name,
        external_ref=body.external_ref,
        name=body.name,
    )
    db.commit()
    db.refresh(case)
    return _serialize_case_detail(db, case)


@router.get("/{case_id}", response_model=dict)
def get_case(
    case_id: int,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    case = db.get(Case, case_id)
    if not case or case.tenant_id != tenant_id:
        raise HTTPException(404, "Case not found")
    return _serialize_case_detail(db, case)


@router.patch("/{case_id}", response_model=dict)
def update_case(
    case_id: int,
    body: CasePatch,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    case = db.get(Case, case_id)
    if not case or case.tenant_id != tenant_id:
        raise HTTPException(404, "Case not found")

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    if body.name is not None:
        case.name = body.name
    if body.status is not None:
        valid_statuses = ("open", "awaiting_applicant", "under_review", "closed_accepted", "closed_rejected")
        if body.status not in valid_statuses:
            raise HTTPException(400, f"Invalid status. Must be one of: {valid_statuses}")
        case.status = body.status
        if body.status.startswith("closed_"):
            case.closed_at = now
    if body.contact_email is not None:
        case.contact_email = body.contact_email
    if body.contact_name is not None:
        case.contact_name = body.contact_name
    if body.external_ref is not None:
        case.external_ref = body.external_ref
    case.updated_at = now

    db.commit()
    db.refresh(case)
    return _serialize_case_detail(db, case)


@router.post("/{case_id}/documents", response_model=dict)
def attach_documents(
    case_id: int,
    body: CaseDocumentAttach,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    case = db.get(Case, case_id)
    if not case or case.tenant_id != tenant_id:
        raise HTTPException(404, "Case not found")

    for doc_id in body.document_ids:
        doc = db.get(Document, doc_id)
        if not doc or doc.tenant_id != tenant_id:
            raise HTTPException(404, f"Document {doc_id} not found")
        attach_document_to_case(db, case, doc, source="upload")

    db.commit()
    db.refresh(case)
    return _serialize_case_detail(db, case)


@router.post("/{case_id}/run", response_model=RunOut, status_code=201)
def run_case(
    case_id: int,
    body: CaseRunCreate,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    case = db.get(Case, case_id)
    if not case or case.tenant_id != tenant_id:
        raise HTTPException(404, "Case not found")

    policy_id = body.policy_id or case.policy_id
    workflow_id = body.workflow_id or case.workflow_id

    doc_ids = current_document_ids(db, case)
    if not doc_ids:
        raise HTTPException(400, "No documents in case to run against")

    docs = [db.get(Document, did) for did in doc_ids]
    docs = [d for d in docs if d and d.tenant_id == tenant_id]
    if not docs:
        raise HTTPException(400, "No valid documents found")

    run_name = docs[0].original_filename if len(docs) == 1 else f"{len(docs)} documents"

    if policy_id:
        from app.models.policy import Policy
        from app.routers.validate import _canonical_definition
        policy = db.get(Policy, policy_id)
        if not policy or policy.tenant_id != tenant_id:
            raise HTTPException(404, "Policy not found")
        run = WorkflowRun(
            tenant_id=tenant_id,
            document_id=docs[0].id,
            name=run_name,
            source="case",
            policy_id=policy_id,
            case_id=case.id,
            status="pending",
        )
        db.add(run)
        db.commit()
        db.refresh(run)
        trigger_run(run.id, _canonical_definition(policy_id), docs)
    elif workflow_id:
        from app.models.workflow import Workflow
        wf = db.get(Workflow, workflow_id)
        if not wf or wf.tenant_id != tenant_id or wf.is_archived:
            raise HTTPException(404, "Workflow not found")
        latest_version = wf.versions[-1] if wf.versions else None
        definition = latest_version.definition if latest_version else wf.definition
        run = WorkflowRun(
            tenant_id=tenant_id,
            workflow_id=workflow_id,
            document_id=docs[0].id,
            name=run_name,
            source="case",
            case_id=case.id,
            version_id=latest_version.id if latest_version else None,
            version_num=latest_version.version_num if latest_version else None,
            status="pending",
        )
        db.add(run)
        db.commit()
        db.refresh(run)
        trigger_run(run.id, definition, docs)
    else:
        raise HTTPException(400, "Case has no policy or workflow target")

    attach_run_to_case(db, case, run)
    db.commit()
    db.refresh(run)
    return run


@router.post("/{case_id}/reply", response_model=dict, status_code=201)
def reply_on_case(
    case_id: int,
    body: CaseReply,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    case = db.get(Case, case_id)
    if not case or case.tenant_id != tenant_id:
        raise HTTPException(404, "Case not found")
    if not case.contact_email:
        raise HTTPException(400, "Case has no contact email to reply to")

    now = datetime.now(timezone.utc).replace(tzinfo=None)

    # Determine reply-from address (tokenized mailbox)
    reply_from = app_settings.invite_from_address
    if case.policy_id:
        from app.models.policy import Policy
        policy = db.get(Policy, case.policy_id)
        if policy and policy.email_address:
            token = ensure_case_email_token(db, case, tenant_id)
            from app.system_settings import mail_inbound_domain
            domain = mail_inbound_domain(db)
            local = policy.email_address.split("@")[0]
            reply_from = f"{local}+{token}@{domain}"
    elif case.workflow_id:
        from app.models.workflow import Workflow
        wf = db.get(Workflow, case.workflow_id)
        if wf and wf.email_address:
            token = ensure_case_email_token(db, case, tenant_id)
            from app.system_settings import mail_inbound_domain
            domain = mail_inbound_domain(db)
            local = wf.email_address.split("@")[0]
            reply_from = f"{local}+{token}@{domain}"

    subject = body.subject or f"Re: {case.name or f'Case #{case.id}'}"
    msg = MailMessage(
        tenant_id=tenant_id,
        case_id=case.id,
        direction="outbound",
        from_addr=reply_from,
        to_addr=case.contact_email,
        subject=subject,
        body=body.body,
        created_at=now,
    )
    db.add(msg)
    case.last_activity_at = now
    case.updated_at = now
    db.commit()
    db.refresh(msg)

    # Send real email (skip @interpret.local)
    if not case.contact_email.endswith("@interpret.local"):
        send_email(
            to=case.contact_email,
            subject=subject,
            html=f"<p>{body.body}</p>",
            text=body.body,
            reply_to=reply_from,
        )

    return {"id": msg.id, "sent_to": case.contact_email, "subject": subject}


@router.post("/{case_id}/notes", response_model=dict, status_code=201)
def add_note(
    case_id: int,
    body: CaseNote,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    case = db.get(Case, case_id)
    if not case or case.tenant_id != tenant_id:
        raise HTTPException(404, "Case not found")

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    msg = MailMessage(
        tenant_id=tenant_id,
        case_id=case.id,
        direction="note",
        from_addr="internal",
        to_addr="internal",
        body=body.body,
        created_at=now,
    )
    db.add(msg)
    case.last_activity_at = now
    case.updated_at = now
    db.commit()
    db.refresh(msg)
    return {"id": msg.id}
