"""`send_email` node — sends a real email (via Resend) to the recipient AND
records an outbound MailMessage (in-app channel / case timeline).

Mirrors `show_results._send_reply`: the in-app copy is always recorded; a real
send goes out for real recipients only (addresses ending in `@interpret.local`
are the in-app test fixture and stay in-app). `reply_to` is the policy/workflow
mailbox, tokenized with the case token so the recipient's reply loops back into
the same case (this is what makes the "wait for documents" branch work — the
applicant replies with the missing files and they re-enter the case).

Idempotency-guarded by the step's idempotency_key (recorded as the outbound
MailMessage.external_id) so an acks_late redelivery / lease reclaim never
double-sends.
"""
from __future__ import annotations

import html as _html

from app.config import settings
from app.database import SessionLocal
from app.engine.context import Output, StepContext
from app.models.mail import MailMessage
from app.tasks.nodes.template import render_template


def _reply_to_for_run(db, run_id) -> str | None:
    """The policy/workflow mailbox for this run, tokenized for case threading."""
    from app.models.policy import Policy
    from app.models.run import WorkflowRun
    from app.models.workflow import Workflow

    run = db.get(WorkflowRun, run_id)
    if not run:
        return None
    reply_to = None
    if run.policy_id:
        p = db.get(Policy, run.policy_id)
        reply_to = p.email_address if p else None
    elif run.workflow_id:
        w = db.get(Workflow, run.workflow_id)
        reply_to = w.email_address if w else None
    if run.case_id and reply_to and "@" in reply_to:
        from app.cases import get_case_email_token
        from app.models.case import Case
        case = db.get(Case, run.case_id)
        if case:
            token = get_case_email_token(case)
            if token:
                local, domain = reply_to.rsplit("@", 1)
                reply_to = f"{local}+{token}@{domain}"
    return reply_to


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
    reply_to = None
    already = False
    # Record the in-app copy (idempotent) BEFORE the real send, so a crash can
    # only ever lose a send — never double-send it.
    with SessionLocal() as db:
        if db.query(MailMessage).filter(MailMessage.external_id == marker).first():
            already = True
        else:
            reply_to = _reply_to_for_run(db, ctx.run_id)
            db.add(MailMessage(
                tenant_id=ctx.tenant_id, run_id=ctx.run_id, direction="outbound",
                from_addr=settings.invite_from_address, to_addr=to,
                subject=subject or "(no subject)", body=body, external_id=marker,
            ))
            db.commit()

    # Real send for real recipients. `@interpret.local` (the in-app test fixture)
    # stays in-app only; without a Resend key the mailer logs a stub (never raises).
    sent = False
    if not already and "@" in to and not to.lower().endswith("@interpret.local"):
        from app.mailer import send_email
        html_body = (
            f'<pre style="font-family:ui-monospace,Menlo,monospace;white-space:pre-wrap;'
            f'font-size:13px">{_html.escape(body)}</pre>'
            if body else f"<p>{_html.escape(subject or '')}</p>"
        )
        try:
            res = send_email(to=to, subject=subject or "(no subject)", html=html_body, text=body or None, reply_to=reply_to)
            sent = bool(res.ok)
        except Exception as exc:  # noqa: BLE001 — a delivery failure must not fail the run
            ctx.log(f"Real email send failed (non-fatal): {exc}")

    ctx.log(f"Email {'sent' if sent else 'recorded'} to {to!r} — subject: {subject!r}")
    return Output({**data, "sent_to": to, "sent_subject": subject})
