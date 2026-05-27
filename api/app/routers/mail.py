from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.document import Document
from app.models.mail import MailMessage
from app.models.policy import Policy
from app.models.run import WorkflowRun
from app.models.workflow import Workflow
from app.models.workflow_version import WorkflowVersion
from app.schemas.mail import MailboxOut, MailInboundRequest, MailMessageOut
from app.schemas.run import RunOut
from app.tasks.executor import trigger_run

router = APIRouter()


def _canonical_definition(policy_id: int) -> dict:
    return {
        "nodes": [
            {"id": "v_input",    "type": "input",              "data": {},                        "position": {"x": 0, "y": 0}},
            {"id": "v_pdf",      "type": "pdf_to_images",      "data": {"scale": 2.0},            "position": {"x": 0, "y": 100}},
            {"id": "v_validate", "type": "validate_documents", "data": {"policy_id": policy_id},  "position": {"x": 0, "y": 200}},
            {"id": "v_results",  "type": "show_results",       "data": {},                        "position": {"x": 0, "y": 300}},
        ],
        "edges": [
            {"id": "ve1", "source": "v_input",    "target": "v_pdf"},
            {"id": "ve2", "source": "v_pdf",      "target": "v_validate"},
            {"id": "ve3", "source": "v_validate", "target": "v_results"},
        ],
    }


@router.get("/mailboxes", response_model=list[MailboxOut])
def list_mailboxes(db: Session = Depends(get_db)):
    mailboxes: list[MailboxOut] = []

    policies = db.query(Policy).filter(Policy.email_inbox_enabled == True).all()  # noqa: E712
    for p in policies:
        if p.email_address:
            mailboxes.append(MailboxOut(
                type="policy",
                id=p.id,
                name=p.name,
                email_address=p.email_address,
                rule_count=len(p.rules),
            ))

    workflows = db.query(Workflow).filter(
        Workflow.email_inbox_enabled == True,  # noqa: E712
        Workflow.is_archived == False,  # noqa: E712
    ).all()
    for wf in workflows:
        if wf.email_address:
            mailboxes.append(MailboxOut(
                type="workflow",
                id=wf.id,
                name=wf.name,
                email_address=wf.email_address,
            ))

    return mailboxes


@router.post("/inbound", response_model=RunOut, status_code=201)
def inbound_mail(body: MailInboundRequest, db: Session = Depends(get_db)):
    to_addr = body.to.strip().lower()

    # resolve recipient to a policy or workflow mailbox
    policy = db.query(Policy).filter(
        Policy.email_inbox_enabled == True,  # noqa: E712
        Policy.email_address == to_addr,
    ).first()

    workflow = None
    if not policy:
        workflow = db.query(Workflow).filter(
            Workflow.email_inbox_enabled == True,  # noqa: E712
            Workflow.email_address == to_addr,
            Workflow.is_archived == False,  # noqa: E712
        ).first()

    if not policy and not workflow:
        raise HTTPException(404, f"No active mailbox found for address: {to_addr}")

    doc = None
    if body.document_id:
        doc = db.get(Document, body.document_id)
        if not doc:
            raise HTTPException(404, "Document not found")

    if policy:
        run = WorkflowRun(
            workflow_id=0,
            document_id=doc.id if doc else 0,
            name=doc.original_filename if doc else body.subject or "mail",
            source="mail",
            policy_id=policy.id,
            sender_email=body.from_email,
            status="pending",
        )
    else:
        latest_version = (
            db.query(WorkflowVersion)
            .filter(WorkflowVersion.workflow_id == workflow.id)
            .order_by(WorkflowVersion.version_num.desc())
            .first()
        )
        run = WorkflowRun(
            workflow_id=workflow.id,
            document_id=doc.id if doc else 0,
            name=doc.original_filename if doc else body.subject or "mail",
            source="mail",
            sender_email=body.from_email,
            version_id=latest_version.id if latest_version else None,
            version_num=latest_version.version_num if latest_version else None,
            status="pending",
        )

    db.add(run)
    db.commit()
    db.refresh(run)

    # store inbound message record
    db.add(MailMessage(
        run_id=run.id,
        document_id=doc.id if doc else None,
        direction="inbound",
        from_addr=body.from_email,
        to_addr=to_addr,
        subject=body.subject,
        body=body.body,
    ))
    db.commit()

    if doc:
        if policy:
            trigger_run(run.id, _canonical_definition(policy.id), [doc])
        else:
            definition = latest_version.definition if latest_version else workflow.definition
            trigger_run(run.id, definition, [doc])

    db.refresh(run)
    return run


@router.get("/messages", response_model=list[MailMessageOut])
def list_messages(db: Session = Depends(get_db)):
    return (
        db.query(MailMessage)
        .order_by(MailMessage.created_at.desc())
        .all()
    )
