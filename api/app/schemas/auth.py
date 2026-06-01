from datetime import datetime

from pydantic import BaseModel


class LoginRequest(BaseModel):
    # Plain str (not EmailStr): the bootstrap admin is `admin@clerq.local`, and
    # `EmailStr` rejects reserved TLDs like `.local`. Uniqueness is enforced at
    # the DB layer and we look users up by exact email, so format validation
    # adds nothing operationally.
    email: str
    password: str
    # Foundation: when MFA is enabled, a 6-digit TOTP code goes here.
    mfa_code: str | None = None


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_at: datetime


class RefreshRequest(BaseModel):
    refresh_token: str


class TenantOut(BaseModel):
    id: int
    name: str
    slug: str

    class Config:
        from_attributes = True


class UserOut(BaseModel):
    id: int
    tenant_id: int
    email: str
    display_name: str | None
    role: str
    is_active: bool = True
    is_superadmin: bool = False
    mfa_required: bool
    mfa_enrolled: bool = False  # filled in at serialization time

    class Config:
        from_attributes = True


class MeResponse(BaseModel):
    user: UserOut
    tenant: TenantOut


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class UpdateMeRequest(BaseModel):
    display_name: str | None = None
