from datetime import datetime
from pydantic import BaseModel, field_validator, model_validator


class RunCreate(BaseModel):
    workflow_id: int
    document_id: int


class RunStepOut(BaseModel):
    id: int
    node_id: str
    node_type: str
    status: str
    input_data: dict | None
    output_data: dict | None
    error: str | None
    started_at: datetime | None
    completed_at: datetime | None
    logs: list[str] = []

    @field_validator("logs", mode="before")
    @classmethod
    def coerce_logs(cls, v):
        return v if isinstance(v, list) else []

    model_config = {"from_attributes": True}


class RunOut(BaseModel):
    id: int
    workflow_id: int | None  # 0 is stored as sentinel for validate runs; surfaced as None
    document_id: int
    document_ids: list[int] = []  # full set (populated from workflow_run_documents join table)
    version_id: int | None
    version_num: int | None
    name: str | None
    source: str | None
    policy_id: int | None
    sender_email: str | None = None
    status: str
    started_at: datetime | None
    completed_at: datetime | None
    error: str | None
    created_at: datetime
    steps: list[RunStepOut] = []

    @model_validator(mode="after")
    def normalize_workflow_id(self):
        if self.workflow_id == 0:
            self.workflow_id = None
        return self

    model_config = {"from_attributes": True}
