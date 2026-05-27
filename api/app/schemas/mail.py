from datetime import datetime
from pydantic import BaseModel


class MailboxOut(BaseModel):
    type: str  # 'policy' | 'workflow'
    id: int
    name: str
    email_address: str
    rule_count: int | None = None


class MailInboundRequest(BaseModel):
    to: str
    from_email: str
    subject: str | None = None
    body: str | None = None
    document_id: int | None = None


class MailMessageOut(BaseModel):
    id: int
    run_id: int | None
    document_id: int | None
    direction: str
    from_addr: str
    to_addr: str
    subject: str | None
    body: str | None
    created_at: datetime
    model_config = {"from_attributes": True}
