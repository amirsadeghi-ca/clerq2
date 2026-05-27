from datetime import datetime
from pydantic import BaseModel


class DocumentTypeSampleOut(BaseModel):
    id: int
    document_type_id: int
    filename: str
    original_filename: str
    file_path: str
    created_at: datetime
    model_config = {"from_attributes": True}


class DocumentTypeCreate(BaseModel):
    name: str
    description: str | None = None
    ai_instructions: str | None = None


class DocumentTypeUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    ai_instructions: str | None = None


class DocumentTypeOut(BaseModel):
    id: int
    name: str
    description: str | None
    ai_instructions: str | None
    created_at: datetime
    updated_at: datetime
    samples: list[DocumentTypeSampleOut] = []
    model_config = {"from_attributes": True}
