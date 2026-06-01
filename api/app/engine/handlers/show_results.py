"""`show_results` node — terminal display node.

Returns Output(merged input); the scheduler copies a verdict-bearing leaf output
to `run.result`, so the run completes via the scheduler (no `mark_run_done`).
Also sends the policy/workflow email reply — made idempotent via the step's
idempotency_key (recorded as the outbound MailMessage.external_id) so an
acks_late redelivery / lease-reclaim never double-sends.
"""
from __future__ import annotations

import html as _html

from app.config import settings
from app.database import SessionLocal
from app.engine.context import Output, StepContext


def _failed_rules_text(results: list[dict]) -> str:
    lines = []
    for r in results:
        if r.get("status") in ("fail", "uncertain"):
            line = f"  - {r.get('rule_name', '?')} [{r.get('status', 'fail').upper()}]"
            if r.get("evidence"):
                line += f"\n      {r['evidence']}"
            lines.append(line)
    return "\n".join(lines) if lines else "(none)"


def _send_reply(ctx: StepContext, data: dict) -> None:
    from app.mailer import send_email
    from app.models.mail import MailMessage
    from app.models.policy import Policy
    from app.models.run import WorkflowRun
    from app.models.workflow import Workflow

    marker = f"reply:{ctx.idempotency_key}"  # idempotency guard
    sender_email = None
    body = None
    subject = None
    reply_to = None
    from_addr = settings.invite_from_address

    with SessionLocal() as db:
        run = db.get(WorkflowRun, ctx.run_id)
        if not (run and run.sender_email):
            return
        # Already replied for this attempt? (redelivery / reclaim) → skip.
        if db.query(MailMessage).filter(MailMessage.external_id == marker).first():
            return
        sender_email = run.sender_email

        overall = data.get("overall")
        results = data.get("results", [])
        is_pass = overall == "pass"
        is_fail = overall in ("fail", "needs_review")

        reply_mode = "always"
        pass_template = fail_template = None
        if run.policy_id:
            policy = db.get(Policy, run.policy_id)
            if policy:
                reply_mode = policy.email_reply_mode or "always"
                pass_template = policy.email_pass_message
                fail_template = policy.email_fail_message
                reply_to = policy.email_address
        elif run.workflow_id:
            wf = db.get(Workflow, run.workflow_id)
            if wf:
                reply_to = wf.email_address

        # Tokenized reply-to for case threading.
        if run.case_id and reply_to and "@" in reply_to:
            from app.cases import get_case_email_token
            from app.models.case import Case
            case = db.get(Case, run.case_id)
            if case:
                token = get_case_email_token(case)
                if token:
                    local, domain = reply_to.rsplit("@", 1)
                    reply_to = f"{local}+{token}@{domain}"

        if reply_mode == "never" or (reply_mode == "on_pass" and not is_pass) \
                or (reply_mode == "on_fail" and not is_fail):
            return

        if overall is not None:
            failed_text = _failed_rules_text(results)
            if is_pass and pass_template:
                body = pass_template.replace("{{failed_rules}}", failed_text)
            elif is_fail and fail_template:
                body = fail_template.replace("{{failed_rules}}", failed_text)
            else:
                rule_lines = [f"  - {r.get('rule_name', '?')}: {r.get('status', '?').upper()}" for r in results]
                body = f"Validation result: {overall.upper()}\n\nRule summary:\n" + "\n".join(rule_lines)
                if is_fail:
                    body += f"\n\nFailed / uncertain checks:\n{failed_text}"
        else:
            body = "Workflow completed successfully."

        subject = f"Re: {run.name or 'Interpret run'}"

        # Record the marker + in-app copy BEFORE the real send, so a crash can
        # only lose a reply — never double-send it.
        db.add(MailMessage(
            tenant_id=run.tenant_id, run_id=ctx.run_id, case_id=run.case_id,
            document_id=run.document_id, direction="outbound", from_addr=from_addr,
            to_addr=sender_email, subject=subject, body=body, external_id=marker,
        ))
        db.commit()

    to_addr = (sender_email or "").strip()
    if "@" in to_addr and not to_addr.lower().endswith("@interpret.local"):
        html_body = (f'<pre style="font-family:ui-monospace,Menlo,monospace;'
                     f'white-space:pre-wrap;font-size:13px">{_html.escape(body)}</pre>')
        send_email(to=to_addr, subject=subject, html=html_body, text=body, reply_to=reply_to)


def show_results(ctx: StepContext) -> Output:
    data = ctx.primary_input()
    ctx.log("Collecting results…")
    try:
        _send_reply(ctx, data)
    except Exception as exc:  # noqa: BLE001 — a reply failure must not fail the run
        ctx.log(f"Reply send failed (non-fatal): {exc}")
    return Output(data)
