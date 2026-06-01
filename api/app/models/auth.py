"""Auth + tenancy models.

Design notes:

- **Tenant** is the top-level isolation unit. Every resource (workflow, policy,
  document, …) carries a `tenant_id`; routes filter by the logged-in user's
  tenant. Cross-tenant access is impossible at the query layer.

- **User** belongs to exactly one tenant (`tenant_id`). Email is unique
  per-tenant, NOT globally — two tenants may have a `admin@…` user. Roles are a
  free string for forward-compat ("owner" / "admin" / "member"). A user is
  inactive until they have at least one verified `AuthIdentity`.

- **AuthIdentity** is a row per (user, provider). Provider "password" stores the
  bcrypt hash in `secret`. Provider "google", "saml", etc. will store the
  provider's subject (sub) in `subject` and leave `secret` null. A user can
  have many identities — that's how account-linking works later.

- **RefreshToken** is server-tracked so we can revoke a session. We store the
  **bcrypt hash** of the random opaque token, never the token itself. The
  client gets the raw token once in an httpOnly cookie / response body.

- **MfaCredential** holds enrolled second factors. Type "totp" stores the
  encrypted shared secret; future types ("webauthn", "sms") slot in here.
  Recovery codes are stored as their bcrypt hashes in `recovery_codes_json`.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="1")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    users: Mapped[list["User"]] = relationship("User", back_populates="tenant", cascade="all, delete-orphan")


class User(Base):
    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("tenant_id", "email", name="uq_users_tenant_email"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(32), nullable=False, default="member", server_default="member")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="1")
    is_superadmin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")
    mfa_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="users")
    identities: Mapped[list["AuthIdentity"]] = relationship(
        "AuthIdentity", back_populates="user", cascade="all, delete-orphan"
    )
    mfa_credentials: Mapped[list["MfaCredential"]] = relationship(
        "MfaCredential", back_populates="user", cascade="all, delete-orphan"
    )


class AuthIdentity(Base):
    """One row per (user, provider). Foundation for SSO / Google / SAML."""

    __tablename__ = "auth_identities"
    __table_args__ = (UniqueConstraint("provider", "subject", name="uq_authidentity_provider_subject"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    provider: Mapped[str] = mapped_column(String(32), nullable=False)  # "password" | "google" | "saml" | …
    subject: Mapped[str | None] = mapped_column(String(255))  # provider's stable subject (sub); null for "password"
    secret: Mapped[str | None] = mapped_column(Text)  # bcrypt hash for "password"; null otherwise
    metadata_json: Mapped[dict | None] = mapped_column(JSON)  # provider extras (e.g. picture URL, hd domain)
    is_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="1")
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    user: Mapped["User"] = relationship("User", back_populates="identities")


class RefreshToken(Base):
    """Server-tracked refresh tokens. We store the bcrypt hash of the random
    opaque token so we can revoke an individual session."""

    __tablename__ = "refresh_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    issued_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime)
    user_agent: Mapped[str | None] = mapped_column(String(512))
    ip_address: Mapped[str | None] = mapped_column(String(64))


class TenantRolePermission(Base):
    """Per-tenant role → permission mapping. Composite PK (tenant_id, role,
    permission_key). The permission key is a code-defined string from
    `app.permissions.Permission`; the role is the same free-string used on
    `users.role`. Adding a row grants; deleting revokes."""

    __tablename__ = "tenant_role_permissions"

    tenant_id: Mapped[int] = mapped_column(Integer, ForeignKey("tenants.id"), primary_key=True)
    role: Mapped[str] = mapped_column(String(32), primary_key=True)
    permission_key: Mapped[str] = mapped_column(String(128), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class UserInvite(Base):
    """A pending invitation to join a tenant. Single-use: the token's bcrypt
    hash is stored; the raw token only ever appears in the invite email and
    on the redirect URL. `accepted_at` marks consumption; `revoked_at` an
    admin cancellation. Either of those plus `expires_at` past makes the
    invite unusable."""

    __tablename__ = "user_invites"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(32), nullable=False, default="member")
    invited_by_user_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    token_hash: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class MfaCredential(Base):
    """Enrolled second factor. Type "totp" today; "webauthn"/"sms" later."""

    __tablename__ = "mfa_credentials"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(32), nullable=False)  # "totp" | "webauthn" | …
    label: Mapped[str | None] = mapped_column(String(255))  # e.g. "iPhone Authenticator"
    secret: Mapped[str | None] = mapped_column(Text)  # encrypted shared secret for TOTP
    recovery_codes_json: Mapped[list | None] = mapped_column(JSON)  # list[str] of bcrypt-hashed codes
    is_confirmed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime)

    user: Mapped["User"] = relationship("User", back_populates="mfa_credentials")


class PasswordResetToken(Base):
    """Single-use, time-limited token for password resets.

    The raw token is sent in the reset link email and never stored.
    Only the bcrypt hash is persisted so a DB leak can't be used to
    reset accounts. `used_at` marks consumption; `expires_at` enforces
    the time window."""

    __tablename__ = "password_reset_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
