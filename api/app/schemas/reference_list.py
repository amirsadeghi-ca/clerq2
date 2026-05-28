from datetime import datetime
from pydantic import BaseModel, field_validator


class ReferenceListCreate(BaseModel):
    name: str
    description: str | None = None
    items: list[str] = []


class ReferenceListUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    items: list[str] | None = None


class ReferenceListOut(BaseModel):
    id: int
    name: str
    description: str | None
    items: list[str] = []
    created_at: datetime
    updated_at: datetime

    @field_validator("items", mode="before")
    @classmethod
    def coerce_items(cls, v):
        if not isinstance(v, list):
            return []
        return [str(x) for x in v]

    model_config = {"from_attributes": True}
