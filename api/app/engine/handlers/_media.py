"""Shared image helpers for handlers (encode to base64 JPEG, render PDF pages)."""
from __future__ import annotations

import base64
import os

import fitz  # pymupdf


def encode_image(abs_path: str) -> str:
    """Base64-encode an image as JPEG (smaller payload). JPEGs pass through; other
    formats are converted via fitz, stripping alpha."""
    ext = os.path.splitext(abs_path)[1].lower()
    if ext in (".jpg", ".jpeg"):
        with open(abs_path, "rb") as f:
            return base64.b64encode(f.read()).decode("utf-8")
    pix = fitz.Pixmap(abs_path)
    if pix.n > 3:  # strip alpha — JPEG can't hold it
        pix = fitz.Pixmap(fitz.csRGB, pix)
    return base64.b64encode(pix.tobytes("jpeg", jpg_quality=85)).decode("utf-8")


def image_content(b64: str, media_type: str = "image/jpeg") -> dict:
    return {"type": "image_url", "image_url": {"url": f"data:{media_type};base64,{b64}"}}


def pdf_to_b64_images(pdf_path: str, max_pages: int = 20, scale: float = 2.0) -> list[str]:
    out: list[str] = []
    doc = fitz.open(pdf_path)
    for i, page in enumerate(doc):
        if i >= max_pages:
            break
        pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale))
        out.append(base64.b64encode(pix.tobytes("jpeg", jpg_quality=85)).decode("utf-8"))
    doc.close()
    return out
