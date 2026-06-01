from app.tasks.celery_app import celery_app
from app.tasks.nodes.base import mark_step_running, mark_step_done, mark_step_failed, mark_run_failed, mark_run_done, step_log, raise_if_cancelled


def _build_failed_rules_text(results: list[dict]) -> str:
    lines = []
    for r in results:
        if r.get("status") in ("fail", "uncertain"):
            name = r.get("rule_name", "?")
            status = r.get("status", "fail").upper()
            evidence = r.get("evidence", "")
            line = f"  - {name} [{status}]"
            if evidence:
                line += f"\n      {evidence}"
            lines.append(line)
    return "\n".join(lines) if lines else "(none)"


def _send_reply(run_id: int, input_data: dict) -> None:
    import html as _html

    from app.config import settings
    from app.database import SessionLocal
    from app.mailer import send_email
    from app.models.run import WorkflowRun
    from app.models.policy import Policy
    from app.models.workflow import Workflow
    from app.models.mail import MailMessage

    with SessionLocal() as db:
        run = db.get(WorkflowRun, run_id)
        if not (run and run.sender_email):
            return

        overall = input_data.get("overall")  # 'pass' | 'fail' | 'needs_review' | None
        results = input_data.get("results", [])
        is_pass = overall == "pass"
        is_fail = overall in ("fail", "needs_review")

        # Load policy reply settings if this is a policy-backed run.
        # reply_to = the mailbox the message arrived at, so a recipient replying
        # continues the loop back into this policy/workflow.
        reply_mode = "always"
        pass_template: str | None = None
        fail_template: str | None = None
        reply_to: str | None = None

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

        # Apply reply mode gate
        if reply_mode == "never":
            return
        if reply_mode == "on_pass" and not is_pass:
            return
        if reply_mode == "on_fail" and not is_fail:
            return

        # Build body
        if overall is not None:
            failed_rules_text = _build_failed_rules_text(results)
            if is_pass and pass_template:
                body = pass_template.replace("{{failed_rules}}", failed_rules_text)
            elif is_fail and fail_template:
                body = fail_template.replace("{{failed_rules}}", failed_rules_text)
            else:
                # Default body
                rule_lines = [
                    f"  - {r.get('rule_name', '?')}: {r.get('status', '?').upper()}"
                    for r in results
                ]
                body = f"Validation result: {overall.upper()}\n\nRule summary:\n" + "\n".join(rule_lines)
                if is_fail:
                    body += f"\n\nFailed / uncertain checks:\n{failed_rules_text}"
        else:
            body = "Workflow completed successfully."

        subject = f"Re: {run.name or 'Interpret run'}"
        from_addr = settings.invite_from_address

        # Always record the in-app copy (the /mail inbox view).
        db.add(MailMessage(
            tenant_id=run.tenant_id,
            run_id=run_id,
            document_id=run.document_id,
            direction="outbound",
            from_addr=from_addr,
            to_addr=run.sender_email,
            subject=subject,
            body=body,
        ))
        db.commit()

    # Send the real email outside the DB session. Skip the local test-fixture
    # domain so UI-driven /mail compose tests don't fire real mail.
    to_addr = (run.sender_email or "").strip()
    if "@" in to_addr and not to_addr.lower().endswith("@interpret.local"):
        html_body = f'<pre style="font-family:ui-monospace,Menlo,monospace;white-space:pre-wrap;font-size:13px">{_html.escape(body)}</pre>'
        send_email(to=to_addr, subject=subject, html=html_body, text=body, reply_to=reply_to)


@celery_app.task(name="nodes.show_results", bind=True)
def show_results_task(self, input_data: dict, run_id: int, step_id: int, node_config: dict | None = None) -> dict:
    mark_step_running(step_id)
    try:
        raise_if_cancelled(run_id)
        step_log(step_id, "Collecting results...")
        mark_step_done(step_id, input_data)
        mark_run_done(run_id)
        _send_reply(run_id, input_data)
        return input_data
    except Exception as exc:
        mark_step_failed(step_id, str(exc))
        mark_run_failed(run_id, str(exc))
        raise
