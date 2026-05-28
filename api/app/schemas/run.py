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
    review: dict | None = None  # Phase 6 — human-review state (notes, overrides, finalize/reopen audit)

    @model_validator(mode="after")
    def normalize_workflow_id(self):
        if self.workflow_id == 0:
            self.workflow_id = None
        return self

    model_config = {"from_attributes": True}


# ─── Phase 6: human review on the report ───────────────────────────────────

class FindingAnnotationIn(BaseModel):
    """Set / clear a per-finding note and/or override. Null clears the field;
    omitted fields are left untouched (use null to explicitly clear)."""
    note: str | None = None
    override_status: str | None = None  # 'pass' | 'fail' | 'uncertain' | 'not_applicable' | None
    override_reason: str | None = None  # required when override_status changes the AI verdict
    clear_note: bool = False           # explicitly clear the note
    clear_override: bool = False       # explicitly clear the override
