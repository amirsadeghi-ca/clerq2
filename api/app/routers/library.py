import os
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.document_type import DocumentType, DocumentTypeSample
from app.schemas.library import DocumentTypeCreate, DocumentTypeOut, DocumentTypeSampleOut, DocumentTypeUpdate
from app.security import get_current_tenant_id

router = APIRouter()


def _get_owned(db: Session, doc_type_id: int, tenant_id: int) -> DocumentType:
    dt = db.get(DocumentType, doc_type_id)
    if not dt or dt.tenant_id != tenant_id:
        raise HTTPException(404, "Document type not found")
    return dt


@router.get("/", response_model=list[DocumentTypeOut])
def list_document_types(db: Session = Depends(get_db), tenant_id: int = Depends(get_current_tenant_id)):
    return (
        db.query(DocumentType)
        .filter(DocumentType.tenant_id == tenant_id)
        .order_by(DocumentType.created_at.desc())
        .all()
    )


@router.post("/", response_model=DocumentTypeOut, status_code=201)
def create_document_type(
    body: DocumentTypeCreate,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    dt = DocumentType(tenant_id=tenant_id, **body.model_dump())
    db.add(dt)
    db.commit()
    db.refresh(dt)
    return dt


@router.get("/{doc_type_id}", response_model=DocumentTypeOut)
def get_document_type(
    doc_type_id: int,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    return _get_owned(db, doc_type_id, tenant_id)


@router.put("/{doc_type_id}", response_model=DocumentTypeOut)
def update_document_type(
    doc_type_id: int,
    body: DocumentTypeUpdate,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    dt = _get_owned(db, doc_type_id, tenant_id)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(dt, field, value)
    db.commit()
    db.refresh(dt)
    return dt


@router.delete("/{doc_type_id}", status_code=204)
def delete_document_type(
    doc_type_id: int,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    dt = _get_owned(db, doc_type_id, tenant_id)
    db.delete(dt)
    db.commit()


@router.post("/{doc_type_id}/samples", response_model=DocumentTypeSampleOut, status_code=201)
async def upload_sample(
    doc_type_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    _get_owned(db, doc_type_id, tenant_id)

    sample_dir = os.path.join(settings.storage_path, "library", str(doc_type_id))
    os.makedirs(sample_dir, exist_ok=True)

    ext = os.path.splitext(file.filename or "")[1]
    stored_name = f"{uuid.uuid4()}{ext}"
    file_path = os.path.join(sample_dir, stored_name)

    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    sample = DocumentTypeSample(
        document_type_id=doc_type_id,
        filename=stored_name,
        original_filename=file.filename or stored_name,
        file_path=file_path,
    )
    db.add(sample)
    db.commit()
    db.refresh(sample)
    return sample


@router.delete("/{doc_type_id}/samples/{sample_id}", status_code=204)
def delete_sample(
    doc_type_id: int,
    sample_id: int,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    _get_owned(db, doc_type_id, tenant_id)
    sample = db.get(DocumentTypeSample, sample_id)
    if not sample or sample.document_type_id != doc_type_id:
        raise HTTPException(404, "Sample not found")
    try:
        os.remove(sample.file_path)
    except FileNotFoundError:
        pass
    db.delete(sample)
    db.commit()
