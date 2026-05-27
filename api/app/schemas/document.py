from datetime import datetime
from pydantic import BaseModel


class DocumentOut(BaseModel):
    id: int
    filename: str
    original_filename: str
    file_path: str
    mime_type: str | None
    size_bytes: int | None
    created_at: datetime

    model_config = {"from_attributes": True}
