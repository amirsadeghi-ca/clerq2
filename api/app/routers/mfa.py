"""MFA management endpoints (TOTP authenticator apps).

GET    /api/auth/mfa                                → list enrolled MFA methods
POST   /api/auth/mfa/totp/enroll                    → start enrollment; returns provisioning URI
POST   /api/auth/mfa/totp/confirm                   → verify code to activate; returns one-time recovery codes
DELETE /api/auth/mfa/{credential_id}                → remove a method (requires current_password or totp_code)
POST   /api/auth/mfa/recovery-codes/regenerate      → regenerate recovery codes (requires totp_code)

Industry standards followed:
- RFC 6238 (TOTP), 30-second window, 6 digits
- Clock-drift tolerance: ±1 window (valid_window=1 in pyotp = 90-second acceptance)
- TOTP secrets encrypted at rest with Fernet (key derived from SECRET_KEY)
- Recovery codes: 10 × 8-char uppercase alphanumeric codes formatted "XXXXX-XXX" (not bcrypt — they
  need constant-time compare without per-code hash scan; we store a single SHA-256 hash per code for
  fast lookup, wrapped in a short bcrypt round for storage protection).
  Actually we store bcrypt hashes like refresh tokens — bcrypt the 8-char code directly (well within
  72-byte limit). 10 codes = 10 DB scan items, which is trivially fast.
- Codes are single-use: once consumed, the hash is replaced with a sentinel.

Recovery code format: XXXXX-XXXXX (two groups of 5 uppercase letters/digits, 16 valid chars = A-Z 0-9
minus ambiguous O/0/I/1/L — giving ~24 bits of entropy per group, ~48 bits total per code).
"""
from __future__ import annotations

import secrets
import string
from datetime import datetime, timezone

import pyotp
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.auth import MfaCredential, User
from app.security import get_current_user, hash_password, verify_password
from app.totp import decrypt_totp_secret, encrypt_totp_secret, verify_totp_code

router = APIRouter()

# Recovery code alphabet: uppercase alphanumeric minus visually ambiguous chars
_CODE_ALPHA = "".join(c for c in (string.ascii_uppercase + string.digits) if c not in "O0I1L")
_CODE_GROUP = 5   # chars per group
_CODE_GROUPS = 2  # groups per code
_CODE_COUNT = 10  # codes generated per enrollment / regeneration


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _gen_recovery_code() -> str:
    groups = ["".join(secrets.choice(_CODE_ALPHA) for _ in range(_CODE_GROUP)) for _ in range(_CODE_GROUPS)]
    return "-".join(groups)


def _issue_recovery_codes() -> tuple[list[str], list[str]]:
    """Returns (raw_codes, hashed_codes)."""
    raw = [_gen_recovery_code() for _ in range(_CODE_COUNT)]
    hashed = [hash_password(code) for code in raw]
    return raw, hashed


def _verify_and_consume_recovery_code(stored_hashes: list[str], candidate: str) -> tuple[bool, list[str]]:
    """Check candidate against stored hashes. Returns (matched, updated_hashes).
    Consumed codes are replaced with a sentinel so the list length is stable."""
    updated = list(stored_hashes)
    sentinel = "USED"
    for i, h in enumerate(stored_hashes):
        if h == sentinel:
            continue
        if verify_password(candidate, h):
            updated[i] = sentinel
            return True, updated
    return False, stored_hashes


def _confirmed_totp(user: User) -> MfaCredential | None:
    for c in (user.mfa_credentials or []):
        if c.type == "totp" and c.is_confirmed:
            return c
    return None


def _require_auth_proof(user: User, body_password: str | None, body_totp_code: str | None) -> None:
    """Require either current password or a valid TOTP code for destructive MFA ops."""
    if body_password:
        from app.routers.auth import _password_identity  # local import avoids circular
        ident = _password_identity(user)
        if not ident or not verify_password(body_password, ident.secret):
            raise HTTPException(status_code=400, detail="Current password is incorrect")
        return
    if body_totp_code:
        cred = _confirmed_totp(user)
        if not cred:
            raise HTTPException(status_code=400, detail="No MFA method enrolled")
        secret = decrypt_totp_secret(cred.secret)
        if not verify_totp_code(secret, body_totp_code):
            raise HTTPException(status_code=400, detail="Invalid authenticator code")
        return
    raise HTTPException(status_code=400, detail="Provide current_password or totp_code to confirm this action")


# ─── Schemas ──────────────────────────────────────────────────────────────────

class MfaMethodOut(BaseModel):
    id: int
    type: str
    label: str | None
    is_confirmed: bool
    created_at: datetime
    last_used_at: datetime | None


class EnrollTotpRequest(BaseModel):
    label: str | None = None   # e.g. "iPhone", "Authy"


class EnrollTotpResponse(BaseModel):
    credential_id: int
    provisioning_uri: str   # otpauth://totp/… — feed to QR code renderer
    secret: str             # base32 secret for manual entry


class ConfirmTotpRequest(BaseModel):
    credential_id: int
    code: str               # 6-digit code from authenticator


class ConfirmTotpResponse(BaseModel):
    recovery_codes: list[str]   # shown ONCE; store them safely


class RemoveMfaRequest(BaseModel):
    current_password: str | None = None
    totp_code: str | None = None


class RegenerateRecoveryRequest(BaseModel):
    totp_code: str


class RecoveryCodesResponse(BaseModel):
    recovery_codes: list[str]


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.get("/mfa", response_model=list[MfaMethodOut])
def list_mfa_methods(user: User = Depends(get_current_user)):
    return [
        MfaMethodOut(
            id=c.id,
            type=c.type,
            label=c.label,
            is_confirmed=c.is_confirmed,
            created_at=c.created_at,
            last_used_at=c.last_used_at,
        )
        for c in (user.mfa_credentials or [])
        if c.is_confirmed
    ]


@router.post("/mfa/totp/enroll", response_model=EnrollTotpResponse)
def enroll_totp(
    body: EnrollTotpRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Clean up any stale pending enrollments for this user.
    stale = [c for c in (user.mfa_credentials or []) if c.type == "totp" and not c.is_confirmed]
    for c in stale:
        db.delete(c)

    secret = pyotp.random_base32()
    provisioning_uri = pyotp.totp.TOTP(secret).provisioning_uri(
        name=user.email,
        issuer_name="Interpret",
    )

    cred = MfaCredential(
        user_id=user.id,
        type="totp",
        label=body.label or "Authenticator app",
        secret=encrypt_totp_secret(secret),
        is_confirmed=False,
    )
    db.add(cred)
    db.flush()
    db.commit()
    db.refresh(cred)

    return EnrollTotpResponse(
        credential_id=cred.id,
        provisioning_uri=provisioning_uri,
        secret=secret,
    )


@router.post("/mfa/totp/confirm", response_model=ConfirmTotpResponse)
def confirm_totp(
    body: ConfirmTotpRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cred = db.get(MfaCredential, body.credential_id)
    if not cred or cred.user_id != user.id or cred.type != "totp" or cred.is_confirmed:
        raise HTTPException(status_code=404, detail="Pending enrollment not found")

    secret = decrypt_totp_secret(cred.secret)
    if not verify_totp_code(secret, body.code):
        raise HTTPException(status_code=400, detail="Invalid code — check your authenticator app and try again")

    raw_codes, hashed_codes = _issue_recovery_codes()

    cred.is_confirmed = True
    cred.last_used_at = datetime.now(timezone.utc)
    cred.recovery_codes_json = hashed_codes
    user.mfa_required = True
    db.commit()

    return ConfirmTotpResponse(recovery_codes=raw_codes)


@router.delete("/mfa/{credential_id}", status_code=204)
def remove_mfa(
    credential_id: int,
    body: RemoveMfaRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cred = db.get(MfaCredential, credential_id)
    if not cred or cred.user_id != user.id:
        raise HTTPException(status_code=404, detail="MFA method not found")

    _require_auth_proof(user, body.current_password, body.totp_code)

    db.delete(cred)

    # If no confirmed credentials remain, clear the mfa_required flag.
    remaining_confirmed = [
        c for c in (user.mfa_credentials or [])
        if c.id != credential_id and c.is_confirmed
    ]
    if not remaining_confirmed:
        user.mfa_required = False

    db.commit()
    return None


@router.post("/mfa/recovery-codes/regenerate", response_model=RecoveryCodesResponse)
def regenerate_recovery_codes(
    body: RegenerateRecoveryRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cred = _confirmed_totp(user)
    if not cred:
        raise HTTPException(status_code=400, detail="No TOTP method enrolled")

    secret = decrypt_totp_secret(cred.secret)
    if not verify_totp_code(secret, body.totp_code):
        raise HTTPException(status_code=400, detail="Invalid authenticator code")

    raw_codes, hashed_codes = _issue_recovery_codes()
    cred.recovery_codes_json = hashed_codes
    db.commit()

    return RecoveryCodesResponse(recovery_codes=raw_codes)
