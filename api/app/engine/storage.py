"""Storage abstraction (D2).

All file access goes through a `Storage` backend so the engine and node handlers
never touch `open()`/`os.path` directly. Today the only backend is `LocalStorage`
(wrapping the existing `STORAGE_PATH` layout); an S3/MinIO backend is a later
config flip behind `get_storage()` — no handler changes required.

Convention: methods take **storage-relative** paths
(e.g. ``"run_1_doc_2_pages/page_0001.png"``). For backward compatibility with the
existing `Document.file_path` (which is stored as an absolute path under the
storage root), the local backend also accepts an absolute path and resolves it,
rejecting anything that escapes the root.
"""
from __future__ import annotations

import os
import shutil
from abc import ABC, abstractmethod
from typing import BinaryIO

from app.config import settings


class Storage(ABC):
    """Backend-agnostic file access keyed by storage-relative paths."""

    @abstractmethod
    def abspath(self, path: str) -> str:
        """Resolve a relative (or already-absolute, local-only) path to a
        concrete location the backend can read/write."""

    @abstractmethod
    def save(self, rel_path: str, data: bytes) -> str:
        """Write bytes at `rel_path`, creating parents; return `rel_path`."""

    @abstractmethod
    def open(self, path: str, mode: str = "rb") -> BinaryIO:
        """Open a file. Write modes create parent directories."""

    @abstractmethod
    def read(self, path: str) -> bytes:
        """Read and return the full contents of a file."""

    @abstractmethod
    def exists(self, path: str) -> bool:
        """True if the path refers to an existing file."""

    @abstractmethod
    def copy(self, src: str, dest_rel: str) -> str:
        """Copy `src` (absolute or storage-relative) to `dest_rel`; return it."""

    @abstractmethod
    def ensure_dir(self, rel_dir: str) -> None:
        """Create a directory (and parents) under the storage root."""

    def url_for(self, rel_path: str) -> str:
        """Public URL the frontend uses to fetch the file (served by files.py)."""
        return f"/api/files/{rel_path}"


class LocalStorage(Storage):
    """Filesystem backend rooted at `STORAGE_PATH`."""

    def __init__(self, root: str | None = None) -> None:
        self.root = os.path.realpath(root or settings.storage_path)

    def _resolve(self, path: str) -> str:
        # Absolute paths are honoured (legacy Document.file_path); relative
        # paths resolve under the root. Either way we reject traversal escapes.
        if os.path.isabs(path):
            full = os.path.realpath(path)
        else:
            full = os.path.realpath(os.path.join(self.root, path))
        if full != self.root and not full.startswith(self.root + os.sep):
            raise ValueError(f"Path escapes storage root: {path!r}")
        return full

    def abspath(self, path: str) -> str:
        return self._resolve(path)

    def save(self, rel_path: str, data: bytes) -> str:
        full = self._resolve(rel_path)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "wb") as f:
            f.write(data)
        return rel_path

    def open(self, path: str, mode: str = "rb") -> BinaryIO:
        full = self._resolve(path)
        if any(m in mode for m in ("w", "a", "x", "+")):
            os.makedirs(os.path.dirname(full), exist_ok=True)
        return open(full, mode)

    def read(self, path: str) -> bytes:
        with self.open(path, "rb") as f:
            return f.read()

    def exists(self, path: str) -> bool:
        try:
            return os.path.isfile(self._resolve(path))
        except ValueError:
            return False

    def copy(self, src: str, dest_rel: str) -> str:
        src_abs = self._resolve(src)
        dest_abs = self._resolve(dest_rel)
        os.makedirs(os.path.dirname(dest_abs), exist_ok=True)
        shutil.copy2(src_abs, dest_abs)
        return dest_rel

    def ensure_dir(self, rel_dir: str) -> None:
        os.makedirs(self._resolve(rel_dir), exist_ok=True)


_storage: Storage | None = None


def get_storage() -> Storage:
    """Return the process-wide configured storage backend.

    D2: local backend now; an S3/MinIO backend slots in here behind a config
    flag later without touching any handler.
    """
    global _storage
    if _storage is None:
        _storage = LocalStorage()
    return _storage
