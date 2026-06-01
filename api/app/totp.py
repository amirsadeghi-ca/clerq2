"""TOTP helpers: secret encryption/decryption and code verification.

TOTP secrets are encrypted at rest using Fernet symmetric encryption.
The encryption key is derived deterministically from SECRET_KEY (SHA-256 → base64).
This means secrets are only as safe as the app secret — but that's intentional:
an attacker with DB access but without the app config can't recover the secrets.
"""
from __future__ import annotations

import base64
import hashlib

import pyotp
from cryptography.fernet import Fernet

from app.config import settings


def _fernet() -> Fernet:
    raw_key = hashlib.sha256(settings.secret_key.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(raw_key))


def encrypt_totp_secret(plain: str) -> str:
    return _fernet().encrypt(plain.encode()).decode()


def decrypt_totp_secret(cipher: str) -> str:
    return _fernet().decrypt(cipher.encode()).decode()


def verify_totp_code(secret: str, code: str, valid_window: int = 1) -> bool:
    """Verify a 6-digit TOTP code. valid_window=1 allows ±30s clock drift."""
    if not code or not code.strip().isdigit():
        return False
    try:
        return pyotp.TOTP(secret).verify(code.strip(), valid_window=valid_window)
    except Exception:
        return False
