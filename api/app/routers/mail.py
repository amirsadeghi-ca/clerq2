import base64
import hashlib
import hmac
import json
import logging
import os
import time
import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import system_settings
from app.config import settings
from app.database import get_db
from app.mailer import send_email
from app.models.document import Document
from app.models.mail import MailMessage
from app.models.policy import Policy
from app.models.run import WorkflowRun
from app.models.workflow import Workflow
from app.models.workflow_version import WorkflowVersion
from app.schemas.mail import MailboxOut, MailInboundRequest, MailMessageOut
from app.schemas.run import RunOut
from app.security import get_current_tenant_id
from app.tasks.executor import trigger_run

log = logging.getLogger("interpret.mail")

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
def list_mailboxes(db: Session = Depends(get_db), tenant_id: int = Depends(get_current_tenant_id)):
    mailboxes: list[MailboxOut] = []

    policies = (
        db.query(Policy)
        .filter(Policy.tenant_id == tenant_id, Policy.email_inbox_enabled == True)  # noqa: E712
        .all()
    )
    for p in policies:
        if p.email_address:
            mailboxes.append(MailboxOut(
                type="policy", id=p.id, name=p.name,
                email_address=p.email_address, rule_count=len(p.rules),
            ))

    workflows = (
        db.query(Workflow)
        .filter(
            Workflow.tenant_id == tenant_id,
            Workflow.email_inbox_enabled == True,  # noqa: E712
            Workflow.is_archived == False,  # noqa: E712
        )
        .all()
    )
    for wf in workflows:
        if wf.email_address:
            mailboxes.append(MailboxOut(
                type="workflow", id=wf.id, name=wf.name,
                email_address=wf.email_address,
            ))
    return mailboxes


@router.post("/inbound", response_model=RunOut, status_code=201)
def inbound_mail(
    body: MailInboundRequest,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """Inbound mail is currently a UI-driven test fixture, so we scope it to the
    caller's tenant. Real SMTP intake (when added) would not have a logged-in
    user — that path will resolve the tenant via the mailbox's owner instead."""
    to_addr = body.to.strip().lower()

    policy = (
        db.query(Policy)
        .filter(
            Policy.tenant_id == tenant_id,
            Policy.email_inbox_enabled == True,  # noqa: E712
            Policy.email_address == to_addr,
        )
        .first()
    )

    workflow = None
    if not policy:
        workflow = (
            db.query(Workflow)
            .filter(
                Workflow.tenant_id == tenant_id,
                Workflow.email_inbox_enabled == True,  # noqa: E712
                Workflow.email_address == to_addr,
                Workflow.is_archived == False,  # noqa: E712
            )
            .first()
        )

    if not policy and not workflow:
        raise HTTPException(404, f"No active mailbox found for address: {to_addr}")

    doc = None
    if body.document_id:
        doc = db.get(Document, body.document_id)
        if not doc or doc.tenant_id != tenant_id:
            raise HTTPException(404, "Document not found")

    if policy:
        run = WorkflowRun(
            tenant_id=tenant_id,
            workflow_id=None,
            document_id=doc.id if doc else None,
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
            tenant_id=tenant_id,
            workflow_id=workflow.id,
            document_id=doc.id if doc else None,
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

    db.add(MailMessage(
        tenant_id=tenant_id,
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
    else:
        from datetime import datetime, UTC
        run.status = "failed"
        run.error = "No document attached — a validation needs at least one document."
        run.completed_at = datetime.now(UTC)
        db.commit()

    db.refresh(run)
    return run


@router.get("/messages", response_model=list[MailMessageOut])
def list_messages(db: Session = Depends(get_db), tenant_id: int = Depends(get_current_tenant_id)):
    return (
        db.query(MailMessage)
        .filter(MailMessage.tenant_id == tenant_id)
        .order_by(MailMessage.created_at.desc())
        .all()
    )


# ─────────────────────────────────────────────────────────────────────────────
# Real inbound mail — Resend Inbound webhook (email.received)
#
# Unauthenticated: there is no logged-in user behind a webhook. Authenticity is
# established by the Svix signature (RESEND_INBOUND_WEBHOOK_SECRET); the tenant
# is resolved from the matched mailbox's owner row, NOT from a session.
# ─────────────────────────────────────────────────────────────────────────────

_SVIX_TOLERANCE_SECONDS = 5 * 60


def _verify_svix_signature(raw_body: bytes, headers, secret: str) -> bool:
    """Verify a Resend/Svix webhook signature. Returns True when valid (or when
    no secret is configured — dev/stub mode)."""
    if not secret:
        log.warning("[mail:inbound] RESEND_INBOUND_WEBHOOK_SECRET not set — skipping signature verification")
        return True

    svix_id = headers.get("svix-id")
    svix_ts = headers.get("svix-timestamp")
    svix_sig = headers.get("svix-signature")
    if not (svix_id and svix_ts and svix_sig):
        return False

    # Reject stale timestamps (replay protection).
    try:
        if abs(time.time() - int(svix_ts)) > _SVIX_TOLERANCE_SECONDS:
            return False
    except (TypeError, ValueError):
        return False

    try:
        key = base64.b64decode(secret.split("_", 1)[1]) if secret.startswith("whsec_") else secret.encode()
        signed = f"{svix_id}.{svix_ts}.{raw_body.decode()}".encode()
        expected = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest()).decode()
        for part in svix_sig.split():
            sig = part.split(",", 1)[1] if "," in part else part
            if hmac.compare_digest(expected, sig):
                return True
    except Exception:
        log.exception("[mail:inbound] signature verification error")
    return False


def _resolve_mailbox(db: Session, to_addr: str):
    """Find the policy or workflow that owns an inbound address. Global lookup
    (no tenant filter) — addresses embed a globally-unique id."""
    addr = (to_addr or "").strip().lower()
    if not addr:
        return None, None
    policy = (
        db.query(Policy)
        .filter(Policy.email_inbox_enabled == True, func.lower(Policy.email_address) == addr)  # noqa: E712
        .first()
    )
    if policy:
        return policy, None
    workflow = (
        db.query(Workflow)
        .filter(
            Workflow.email_inbox_enabled == True,  # noqa: E712
            Workflow.is_archived == False,  # noqa: E712
            func.lower(Workflow.email_address) == addr,
        )
        .first()
    )
    return None, workflow


def _fetch_inbound_attachments(email_id: str, api_key: str) -> list[dict]:
    """List a received email's attachments via the Resend Attachments API.
    Each item carries a pre-signed `download_url`."""
    if not api_key:
        return []
    resp = httpx.get(
        f"https://api.resend.com/emails/receiving/{email_id}/attachments",
        headers={"Authorization": f"Bearer {api_key}"},
        params={"limit": 100},
        timeout=30,
    )
    if resp.status_code >= 400:
        log.error("[mail:inbound] attachments fetch %s: %s", resp.status_code, resp.text[:200])
        return []
    return resp.json().get("data", []) or []


_INLINE_IMAGE_LOGO_MAX = 50_000  # bytes — small inline images are usually signature logos


def _save_attachment_as_document(db: Session, tenant_id: int, att: dict) -> Document | None:
    """Download one attachment and persist it as a Document. Returns None on skip/fail.

    We keep real documents even when the sender's client marks them `inline`
    (Apple Mail does this for PDFs). The only things we drop are: parts with no
    filename (truly embedded content) and *small inline images* — the classic
    signature-logo case — which would otherwise be ingested as bogus documents.
    """
    filename = (att.get("filename") or "").strip()
    if not filename:
        return None
    size = att.get("size") or 0
    disposition = (att.get("content_disposition") or "").lower()
    ctype = (att.get("content_type") or "").lower()
    if disposition == "inline" and ctype.startswith("image/") and 0 < size < _INLINE_IMAGE_LOGO_MAX:
        log.info("[mail:inbound] skipping small inline image %r (%s bytes)", filename, size)
        return None
    if size and size > settings.mail_max_attachment_bytes:
        log.warning("[mail:inbound] attachment %r over size cap (%s bytes) — skipped", att.get("filename"), size)
        return None
    url = att.get("download_url")
    if not url:
        return None
    try:
        resp = httpx.get(url, timeout=60, follow_redirects=True)
        resp.raise_for_status()
        content = resp.content
    except Exception:
        log.exception("[mail:inbound] failed to download attachment %r", att.get("filename"))
        return None
    if len(content) > settings.mail_max_attachment_bytes:
        log.warning("[mail:inbound] attachment %r exceeded size cap after download — skipped", att.get("filename"))
        return None

    os.makedirs(settings.storage_path, exist_ok=True)
    original = att.get("filename") or "attachment"
    ext = os.path.splitext(original)[1]
    stored_name = f"{uuid.uuid4()}{ext}"
    file_path = os.path.join(settings.storage_path, stored_name)
    with open(file_path, "wb") as f:
        f.write(content)

    doc = Document(
        tenant_id=tenant_id,
        filename=stored_name,
        original_filename=original,
        file_path=file_path,
        mime_type=att.get("content_type"),
        size_bytes=len(content),
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


def _latest_workflow_version(db: Session, workflow: Workflow) -> WorkflowVersion | None:
    return (
        db.query(WorkflowVersion)
        .filter(WorkflowVersion.workflow_id == workflow.id)
        .order_by(WorkflowVersion.version_num.desc())
        .first()
    )


@router.post("/resend-inbound")
async def resend_inbound(request: Request, db: Session = Depends(get_db)):
    raw = await request.body()
    if not _verify_svix_signature(raw, request.headers, system_settings.resend_inbound_webhook_secret(db)):
        raise HTTPException(401, "Invalid webhook signature")

    try:
        payload = json.loads(raw)
    except Exception:
        raise HTTPException(400, "Invalid JSON")

    event_type = payload.get("type")
    if event_type != "email.received":
        return {"ok": True, "ignored": event_type}

    data = payload.get("data") or {}
    email_id = data.get("email_id")
    to_list = data.get("to") or []
    if isinstance(to_list, str):
        to_list = [to_list]
    from_email = data.get("from") or ""
    subject = data.get("subject")

    # Idempotency: Resend retries failed deliveries. Skip if we already ingested it.
    if email_id and db.query(MailMessage).filter(MailMessage.external_id == email_id).first():
        return {"ok": True, "duplicate": True}

    # Resolve which mailbox this was sent to (first matching recipient wins).
    policy = workflow = None
    matched_addr = None
    for addr in to_list:
        policy, workflow = _resolve_mailbox(db, addr)
        if policy or workflow:
            matched_addr = (addr or "").strip().lower()
            break

    if not policy and not workflow:
        # Return 200 so Resend doesn't retry forever for mail we don't own.
        log.info("[mail:inbound] no mailbox for recipients=%s (email_id=%s)", to_list, email_id)
        return {"ok": True, "no_mailbox": to_list}

    tenant_id = policy.tenant_id if policy else workflow.tenant_id

    # Download attachments → Documents.
    docs: list[Document] = []
    if email_id:
        for att in _fetch_inbound_attachments(email_id, system_settings.resend_api_key(db)):
            doc = _save_attachment_as_document(db, tenant_id, att)
            if doc:
                docs.append(doc)

    # Build the run row.
    latest_version = _latest_workflow_version(db, workflow) if workflow else None
    if len(docs) > 1:
        run_name = f"{len(docs)} documents"
    elif docs:
        run_name = docs[0].original_filename
    else:
        run_name = subject or "mail"

    run = WorkflowRun(
        tenant_id=tenant_id,
        workflow_id=workflow.id if workflow else None,
        document_id=docs[0].id if docs else None,
        name=run_name,
        source="mail",
        policy_id=policy.id if policy else None,
        sender_email=from_email,
        version_id=latest_version.id if latest_version else None,
        version_num=latest_version.version_num if latest_version else None,
        status="pending",
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    db.add(MailMessage(
        tenant_id=tenant_id,
        run_id=run.id,
        document_id=docs[0].id if docs else None,
        direction="inbound",
        from_addr=from_email,
        to_addr=matched_addr,
        subject=subject,
        body=data.get("text"),
        external_id=email_id,
    ))
    db.commit()

    if docs:
        if policy:
            trigger_run(run.id, _canonical_definition(policy.id), docs)
        else:
            definition = latest_version.definition if latest_version else workflow.definition
            trigger_run(run.id, definition, docs)
        return {"ok": True, "run_id": run.id, "documents": len(docs)}

    # No usable attachment — fail the run and reply with an explanation.
    from datetime import datetime, UTC
    run.status = "failed"
    run.error = "No document attached — a validation needs at least one document."
    run.completed_at = datetime.now(UTC)
    db.commit()

    if from_email and "@" in from_email and not from_email.lower().endswith("@interpret.local"):
        msg = (
            "We received your message but couldn't find a document to process.\n\n"
            "Please reply with the document attached (PDF, image, Word, Excel, or CSV)."
        )
        send_email(
            to=from_email,
            subject=f"Re: {subject or 'your submission'}",
            html=f"<p>{msg}</p>",
            text=msg,
            reply_to=matched_addr,
        )
        db.add(MailMessage(
            tenant_id=tenant_id,
            run_id=run.id,
            direction="outbound",
            from_addr=settings.invite_from_address,
            to_addr=from_email,
            subject=f"Re: {subject or 'your submission'}",
            body=msg,
        ))
        db.commit()

    return {"ok": True, "run_id": run.id, "documents": 0, "error": "no_document"}
