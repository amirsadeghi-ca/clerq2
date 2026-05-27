import os

from fastapi import HTTPException
from fastapi.responses import FileResponse
from fastapi.routing import APIRouter

from app.config import settings

router = APIRouter()


@router.get("/{path:path}")
def serve_file(path: str):
    # Prevent path traversal
    storage_root = os.path.realpath(settings.storage_path)
    full_path = os.path.realpath(os.path.join(storage_root, path))

    if not full_path.startswith(storage_root + os.sep) and full_path != storage_root:
        raise HTTPException(status_code=400, detail="Invalid path")

    if not os.path.isfile(full_path):
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(full_path)
