import os

import fitz  # pymupdf

from app.config import settings
from app.tasks.celery_app import celery_app
from app.tasks.nodes.base import mark_step_running, mark_step_done, mark_step_failed, mark_run_failed, step_log, raise_if_cancelled


@celery_app.task(name="nodes.pdf_to_images", bind=True)
def pdf_to_images_task(self, input_data: dict, run_id: int, step_id: int, node_config: dict | None = None) -> dict:
    mark_step_running(step_id)
    try:
        raise_if_cancelled(run_id)
        file_path = input_data["file_path"]
        document_id = input_data["document_id"]
        cfg = node_config or {}
        scale = float(cfg.get("scale", 2.0))

        step_log(step_id, f"Opening PDF: {os.path.basename(file_path)}")
        step_log(step_id, f"Scale: {scale}x")

        rel_dir = f"run_{run_id}_doc_{document_id}_pages"
        out_dir = os.path.join(settings.storage_path, rel_dir)
        os.makedirs(out_dir, exist_ok=True)

        doc = fitz.open(file_path)
        page_count = len(doc)
        step_log(step_id, f"Converting PDF: {page_count} page(s)")

        image_paths = []
        for page_num, page in enumerate(doc):
            mat = fitz.Matrix(scale, scale)
            pix = page.get_pixmap(matrix=mat)
            filename = f"page_{page_num + 1:04d}.png"
            img_path = os.path.join(out_dir, filename)
            pix.save(img_path)
            # Store relative path so frontend can request via /api/files/
            image_paths.append(f"{rel_dir}/{filename}")
        doc.close()

        step_log(step_id, f"Saved {len(image_paths)} image(s) to {rel_dir}/")

        output = {
            "document_id": document_id,
            "image_paths": image_paths,
            "page_count": len(image_paths),
        }
        mark_step_done(step_id, output)
        return output
    except Exception as exc:
        mark_step_failed(step_id, str(exc))
        mark_run_failed(run_id, str(exc))
        raise
