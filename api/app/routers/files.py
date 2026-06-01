"""Serve uploaded files (rendered page PNGs, library samples, document blobs).

We trust the storage layout — paths are flat UUIDs at the storage root, with
`run_<id>_doc_<id>_pages/` and `library/<doc_type_id>/` subdirs. To enforce
tenant isolation we resolve each prefix to its owning record and check
ownership before serving the bytes.
"""
from __future__ import annotations

import os
import re

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.document import Document
from app.models.document_type import DocumentType
from app.models.run import WorkflowRun
from app.models.auth import User
from app.security import get_current_user

router = APIRouter()


_RUN_PAGES_RE = re.compile(r"^run_(\d+)_doc_(\d+)_pages(?:/|$)")
_LIBRARY_RE = re.compile(r"^library/(\d+)(?:/|$)")


def _owns_path(db: Session, rel_path: str, tenant_id: int) -> bool:
    """Decide whether `rel_path` belongs to the caller's tenant."""
    m = _RUN_PAGES_RE.match(rel_path)
    if m:
        run_id = int(m.group(1))
        run = db.get(WorkflowRun, run_id)
        return bool(run and run.tenant_id == tenant_id)

    m = _LIBRARY_RE.match(rel_path)
    if m:
        dt_id = int(m.group(1))
        dt = db.get(DocumentType, dt_id)
        return bool(dt and dt.tenant_id == tenant_id)

    # Flat top-level file: must match a Document the tenant owns.
    doc = db.query(Document).filter(
        Document.filename == rel_path,
        Document.tenant_id == tenant_id,
    ).first()
    return doc is not None


@router.get("/{path:path}")
def serve_file(
    path: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    storage_root = os.path.realpath(settings.storage_path)
    full_path = os.path.realpath(os.path.join(storage_root, path))

    if not full_path.startswith(storage_root + os.sep) and full_path != storage_root:
        raise HTTPException(status_code=400, detail="Invalid path")
    if not os.path.isfile(full_path):
        raise HTTPException(status_code=404, detail="File not found")

    if not _owns_path(db, path, user.tenant_id):
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(full_path)
