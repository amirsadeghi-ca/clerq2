from datetime import datetime
from pydantic import BaseModel


class WorkflowDefinition(BaseModel):
    nodes: list[dict] = []
    edges: list[dict] = []


class WorkflowCreate(BaseModel):
    name: str
    description: str | None = None
    definition: WorkflowDefinition = WorkflowDefinition()


class WorkflowUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    definition: WorkflowDefinition | None = None


class WorkflowVersionOut(BaseModel):
    id: int
    workflow_id: int
    version_num: int
    definition: dict
    node_count: int
    created_at: datetime

    model_config = {"from_attributes": True}


class WorkflowOut(BaseModel):
    id: int
    name: str
    description: str | None
    definition: dict
    is_archived: bool
    is_favorite: bool
    email_inbox_enabled: bool
    email_address: str | None
    current_version_num: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
