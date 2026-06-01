"""Outbound email.

Single function `send_email(to, subject, html, text=None)` that dispatches
through Resend (https://resend.com) when `RESEND_API_KEY` is set, otherwise
falls back to logging the message body to stdout so local development still
sees the link.

The function is synchronous (called from request handlers and tasks). It
never raises — a delivery failure is logged and surfaced via the return
value so the caller can decide whether to retry or warn the user.

Adding a new provider is a matter of editing this file; nothing else in the
codebase references the transport.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

import httpx

from app.config import settings

log = logging.getLogger("interpret.mailer")


@dataclass
class SendResult:
    ok: bool
    provider: str
    message_id: str | None = None
    error: str | None = None


def send_email(
    *, to: str, subject: str, html: str, text: str | None = None, reply_to: str | None = None
) -> SendResult:
    # Resolve from system settings (admin Integrations UI) with env fallback.
    from app import system_settings
    api_key = system_settings.resend_api_key()
    if api_key:
        return _send_via_resend(to=to, subject=subject, html=html, text=text, reply_to=reply_to, api_key=api_key)
    # No provider configured — log so local dev still sees the link.
    log.warning(
        "[mailer:stub] (no RESEND_API_KEY) to=%s subject=%r reply_to=%s\n----- BODY -----\n%s\n----------------",
        to, subject, reply_to, text or html,
    )
    return SendResult(ok=True, provider="stub")


def _send_via_resend(
    *, to: str, subject: str, html: str, text: str | None, reply_to: str | None = None, api_key: str
) -> SendResult:
    from app import system_settings
    from_value = f"{system_settings.invite_from_name()} <{system_settings.invite_from_address()}>"
    payload = {
        "from": from_value,
        "to": [to],
        "subject": subject,
        "html": html,
    }
    if text:
        payload["text"] = text
    if reply_to:
        payload["reply_to"] = reply_to
    try:
        resp = httpx.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=15,
        )
        if resp.status_code >= 400:
            log.error("[mailer:resend] %s: %s", resp.status_code, resp.text)
            return SendResult(ok=False, provider="resend", error=f"{resp.status_code}: {resp.text[:200]}")
        data = resp.json()
        log.info("[mailer:resend] sent to=%s id=%s subject=%r", to, data.get("id"), subject)
        return SendResult(ok=True, provider="resend", message_id=data.get("id"))
    except Exception as exc:
        log.exception("[mailer:resend] send failed")
        return SendResult(ok=False, provider="resend", error=str(exc))
