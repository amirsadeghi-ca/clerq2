from app.database import SessionLocal
from app.models.mail import MailMessage
from app.tasks.celery_app import celery_app
from app.tasks.nodes.base import (
    mark_step_running, mark_step_done, mark_step_failed,
    mark_run_failed, step_log, raise_if_cancelled,
)
from app.tasks.nodes.template import render_template


@celery_app.task(name="nodes.send_email", bind=True)
def send_email_task(self, input_data: dict, run_id: int, step_id: int, node_config: dict | None = None) -> dict:
    mark_step_running(step_id)
    try:
        raise_if_cancelled(run_id)
        cfg = node_config or {}

        to = render_template(cfg.get("to", ""), input_data).strip()
        subject = render_template(cfg.get("subject", ""), input_data).strip()
        body = render_template(cfg.get("body", ""), input_data).strip()

        if not to:
            raise ValueError("send_email node requires a 'to' address (got empty string after template rendering)")

        with SessionLocal() as db:
            msg = MailMessage(
                run_id=run_id,
                direction="outbound",
                from_addr="noreply@clerq.local",
                to_addr=to,
                subject=subject or "(no subject)",
                body=body,
            )
            db.add(msg)
            db.commit()

        step_log(step_id, f"Email sent to {to!r} — subject: {subject!r}")

        output = {**input_data, "sent_to": to, "sent_subject": subject}
        mark_step_done(step_id, output)
        return output

    except Exception as exc:
        mark_step_failed(step_id, str(exc))
        mark_run_failed(run_id, str(exc))
        raise
