"""`send_email` node — records an outbound MailMessage (in-app channel),
idempotency-guarded by the step's idempotency_key (external_id)."""
from __future__ import annotations

from app.database import SessionLocal
from app.engine.context import Output, StepContext
from app.models.mail import MailMessage
from app.tasks.nodes.template import render_template


def send_email_node(ctx: StepContext) -> Output:
    cfg = ctx.config or {}
    data = ctx.primary_input()
    to = render_template(cfg.get("to", ""), data).strip()
    subject = render_template(cfg.get("subject", ""), data).strip()
    body = render_template(cfg.get("body", ""), data).strip()
    if not to:
        raise ValueError("send_email node requires a 'to' address "
                         "(got empty string after template rendering)")

    marker = f"sendemail:{ctx.idempotency_key}"
    with SessionLocal() as db:
        if not db.query(MailMessage).filter(MailMessage.external_id == marker).first():
            db.add(MailMessage(
                tenant_id=ctx.tenant_id, run_id=ctx.run_id, direction="outbound",
                from_addr="noreply@interpret.local", to_addr=to,
                subject=subject or "(no subject)", body=body, external_id=marker,
            ))
            db.commit()
    ctx.log(f"Email recorded to {to!r} — subject: {subject!r}")
    return Output({**data, "sent_to": to, "sent_subject": subject})
