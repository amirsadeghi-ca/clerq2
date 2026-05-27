from datetime import datetime
from pydantic import BaseModel

from app.schemas.library import DocumentTypeOut


class PolicyRuleCreate(BaseModel):
    name: str
    requirement: str = "required"
    accept_criteria: str | None = None
    fail_criteria: str | None = None
    ai_instructions: str | None = None
    document_type_id: int | None = None
    confidence_threshold: float = 0.75


class PolicyRuleUpdate(BaseModel):
    name: str | None = None
    requirement: str | None = None
    accept_criteria: str | None = None
    fail_criteria: str | None = None
    ai_instructions: str | None = None
    document_type_id: int | None = None
    confidence_threshold: float | None = None


class PolicyRuleOut(BaseModel):
    id: int
    policy_id: int
    position: int
    name: str
    requirement: str
    accept_criteria: str | None
    fail_criteria: str | None
    ai_instructions: str | None
    document_type_id: int | None
    confidence_threshold: float
    document_type: DocumentTypeOut | None = None
    model_config = {"from_attributes": True}


class PolicyCreate(BaseModel):
    name: str
    description: str | None = None
    brief: str = ""


class PolicyUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    brief: str | None = None
    email_inbox_enabled: bool | None = None
    email_address: str | None = None
    email_reply_mode: str | None = None
    email_pass_message: str | None = None
    email_fail_message: str | None = None


class PolicyVersionOut(BaseModel):
    id: int
    policy_id: int
    version_num: int
    snapshot: dict
    rule_count: int
    created_at: datetime
    model_config = {"from_attributes": True}


class PolicyOut(BaseModel):
    id: int
    name: str
    description: str | None
    brief: str
    email_inbox_enabled: bool
    email_address: str | None
    email_reply_mode: str
    email_pass_message: str | None
    email_fail_message: str | None
    current_version_num: int
    created_at: datetime
    updated_at: datetime
    rules: list[PolicyRuleOut] = []
    model_config = {"from_attributes": True}
