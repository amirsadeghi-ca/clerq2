from app.database import SessionLocal
from app.models.mail import MailMessage
from app.tasks.celery_app import celery_app
from app.tasks.nodes.base import (
    mark_step_running, mark_step_done, mark_step_failed,
    mark_run_failed, step_log, raise_if_cancelled,
)

ALL_FIELDS = {"subject", "from", "to", "body", "attachments"}


@celery_app.task(name="nodes.email_input", bind=True)
def email_input_task(self, input_data: dict, run_id: int, step_id: int, node_config: dict | None = None) -> dict:
    mark_step_running(step_id)
    try:
        raise_if_cancelled(run_id)
        cfg = node_config or {}
        fields = set(cfg.get("fields", list(ALL_FIELDS)))

        with SessionLocal() as db:
            mail_msg = (
                db.query(MailMessage)
                .filter(MailMessage.run_id == run_id, MailMessage.direction == "inbound")
                .first()
            )

        output: dict = {}

        if mail_msg:
            if "subject" in fields:
                output["subject"] = mail_msg.subject or ""
            if "from" in fields:
                output["from"] = mail_msg.from_addr or ""
            if "to" in fields:
                output["to"] = mail_msg.to_addr or ""
            if "body" in fields:
                output["body"] = mail_msg.body or ""
            step_log(step_id, f"Email from {mail_msg.from_addr}: {mail_msg.subject!r}")
        else:
            step_log(step_id, "No inbound mail message found for this run — email fields will be empty")

        # Pass file/attachment info through for downstream nodes regardless of field selection
        if input_data.get("file_path"):
            output["file_path"] = input_data["file_path"]
            output["mime_type"] = input_data.get("mime_type", "")
            if input_data.get("document_id"):
                output["document_id"] = input_data["document_id"]
            if "attachments" in fields:
                step_log(step_id, f"Attachment: {input_data['file_path']}")

        step_log(step_id, f"Output fields: {', '.join(output.keys())}")
        mark_step_done(step_id, output)
        return output

    except Exception as exc:
        mark_step_failed(step_id, str(exc))
        mark_run_failed(run_id, str(exc))
        raise
