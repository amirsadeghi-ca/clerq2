"""`email_input` source node — exposes selected fields of the run's inbound
MailMessage and passes the document set through."""
from __future__ import annotations

from app.database import SessionLocal
from app.engine.context import Output, StepContext
from app.models.mail import MailMessage

ALL_FIELDS = {"subject", "from", "to", "body", "attachments"}


def email_input(ctx: StepContext) -> Output:
    cfg = ctx.config or {}
    fields = set(cfg.get("fields", list(ALL_FIELDS)))
    out: dict = {}

    with SessionLocal() as db:
        msg = (db.query(MailMessage)
               .filter(MailMessage.run_id == ctx.run_id, MailMessage.direction == "inbound")
               .first())
        if msg:
            if "subject" in fields:
                out["subject"] = msg.subject or ""
            if "from" in fields:
                out["from"] = msg.from_addr or ""
            if "to" in fields:
                out["to"] = msg.to_addr or ""
            if "body" in fields:
                out["body"] = msg.body or ""
            ctx.log(f"Email from {msg.from_addr}: {msg.subject!r}")
        else:
            ctx.log("No inbound mail message for this run — email fields empty")

    out["documents"] = ctx.documents()  # pass attachments through
    return Output(out)
