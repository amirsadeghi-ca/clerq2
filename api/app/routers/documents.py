import os
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.document import Document
from app.schemas.document import DocumentOut
from app.security import get_current_tenant_id

router = APIRouter()


@router.post("/upload", response_model=DocumentOut, status_code=201)
async def upload_document(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    os.makedirs(settings.storage_path, exist_ok=True)

    ext = os.path.splitext(file.filename or "")[1]
    stored_name = f"{uuid.uuid4()}{ext}"
    file_path = os.path.join(settings.storage_path, stored_name)

    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    doc = Document(
        tenant_id=tenant_id,
        filename=stored_name,
        original_filename=file.filename or stored_name,
        file_path=file_path,
        mime_type=file.content_type,
        size_bytes=len(content),
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


@router.get("/", response_model=list[DocumentOut])
def list_documents(db: Session = Depends(get_db), tenant_id: int = Depends(get_current_tenant_id)):
    return (
        db.query(Document)
        .filter(Document.tenant_id == tenant_id)
        .order_by(Document.created_at.desc())
        .all()
    )


@router.get("/{document_id}", response_model=DocumentOut)
def get_document(
    document_id: int,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    doc = db.get(Document, document_id)
    if not doc or doc.tenant_id != tenant_id:
        raise HTTPException(404, "Document not found")
    return doc
