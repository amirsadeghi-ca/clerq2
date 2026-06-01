"""Schemas for /api/admin/* (super-admin tenant + user management)."""
from datetime import datetime
from pydantic import BaseModel


class AdminTenantOut(BaseModel):
    id: int
    name: str
    slug: str
    is_active: bool
    user_count: int
    created_at: datetime | None = None

    class Config:
        from_attributes = True


class AdminTenantCreate(BaseModel):
    name: str
    slug: str | None = None


class AdminTenantUpdate(BaseModel):
    name: str | None = None
    slug: str | None = None
    is_active: bool | None = None


class AdminUserOut(BaseModel):
    id: int
    tenant_id: int
    email: str
    display_name: str | None
    role: str
    is_active: bool
    is_superadmin: bool
    mfa_required: bool
    has_password: bool = False
    last_login_at: datetime | None = None
    created_at: datetime | None = None

    class Config:
        from_attributes = True


class AdminUserCreate(BaseModel):
    email: str
    password: str
    display_name: str | None = None
    role: str = "member"
    is_superadmin: bool = False


class AdminUserUpdate(BaseModel):
    display_name: str | None = None
    role: str | None = None
    is_active: bool | None = None
    is_superadmin: bool | None = None
    mfa_required: bool | None = None


class AdminSetPasswordRequest(BaseModel):
    new_password: str
