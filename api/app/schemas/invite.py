from datetime import datetime
from pydantic import BaseModel


class InviteCreate(BaseModel):
    email: str
    role: str = "member"


class InviteOut(BaseModel):
    id: int
    tenant_id: int
    email: str
    role: str
    invited_by_user_id: int | None
    expires_at: datetime
    accepted_at: datetime | None
    revoked_at: datetime | None
    created_at: datetime | None = None
    invite_url: str | None = None  # only included right after creation

    class Config:
        from_attributes = True


class InviteLookupRequest(BaseModel):
    token: str


class InviteLookupResponse(BaseModel):
    valid: bool
    email: str | None = None
    tenant_name: str | None = None
    role: str | None = None
    error: str | None = None


class InviteAcceptRequest(BaseModel):
    token: str
    password: str
    display_name: str | None = None
