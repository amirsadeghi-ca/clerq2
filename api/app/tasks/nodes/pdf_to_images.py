import os

import fitz  # pymupdf

from app.config import settings
from app.tasks.celery_app import celery_app
from app.tasks.nodes.base import mark_step_running, mark_step_done, mark_step_failed, mark_run_failed, step_log, raise_if_cancelled


def _convert_file_to_images(file_path: str, out_dir: str, rel_dir: str, scale: float) -> list[str]:
    """Convert a single file (PDF or image) to page PNGs; returns relative paths."""
    os.makedirs(out_dir, exist_ok=True)
    fitz_doc = fitz.open(file_path)
    image_paths = []
    for page_num, page in enumerate(fitz_doc):
        mat = fitz.Matrix(scale, scale)
        pix = page.get_pixmap(matrix=mat)
        img_file = f"page_{page_num + 1:04d}.png"
        img_path = os.path.join(out_dir, img_file)
        pix.save(img_path)
        image_paths.append(f"{rel_dir}/{img_file}")
    fitz_doc.close()
    return image_paths


@celery_app.task(name="nodes.pdf_to_images", bind=True)
def pdf_to_images_task(self, input_data: dict, run_id: int, step_id: int, node_config: dict | None = None) -> dict:
    mark_step_running(step_id)
    try:
        raise_if_cancelled(run_id)
        cfg = node_config or {}
        scale = float(cfg.get("scale", 2.0))
        step_log(step_id, f"Scale: {scale}x")

        documents_list: list[dict] | None = input_data.get("documents")

        if documents_list:
            # ── Multi-doc mode ──────────────────────────────────────────────
            result_docs = []
            for doc_info in documents_list:
                doc_id = doc_info["id"]
                file_path = doc_info["file_path"]
                filename = doc_info.get("filename", f"doc_{doc_id}")

                step_log(step_id, f"Converting: {filename}")

                rel_dir = f"run_{run_id}_doc_{doc_id}_pages"
                out_dir = os.path.join(settings.storage_path, rel_dir)

                try:
                    image_paths = _convert_file_to_images(file_path, out_dir, rel_dir, scale)
                    step_log(step_id, f"  {filename}: {len(image_paths)} page(s)")
                except Exception as exc:
                    step_log(step_id, f"  {filename}: conversion failed — {exc}")
                    image_paths = []

                result_docs.append({
                    "id": doc_id,
                    "filename": filename,
                    "image_paths": image_paths,
                })

            total_pages = sum(len(d["image_paths"]) for d in result_docs)
            step_log(step_id, f"Total: {len(result_docs)} document(s), {total_pages} page(s)")

            # Flatten all image paths so existing frontend lightbox logic still works
            all_image_paths = [p for d in result_docs for p in d["image_paths"]]

            output = {
                "documents": result_docs,
                # Backward compat — primary doc
                "document_id": input_data.get("document_id"),
                "image_paths": all_image_paths,
                "page_count": total_pages,
            }

        else:
            # ── Single-doc fallback (workflow-editor chains, email_input, etc.) ──
            file_path = input_data["file_path"]
            document_id = input_data["document_id"]

            step_log(step_id, f"Opening PDF: {os.path.basename(file_path)}")

            rel_dir = f"run_{run_id}_doc_{document_id}_pages"
            out_dir = os.path.join(settings.storage_path, rel_dir)
            os.makedirs(out_dir, exist_ok=True)

            fitz_doc = fitz.open(file_path)
            page_count = len(fitz_doc)
            step_log(step_id, f"Converting PDF: {page_count} page(s)")

            image_paths = []
            for page_num, page in enumerate(fitz_doc):
                mat = fitz.Matrix(scale, scale)
                pix = page.get_pixmap(matrix=mat)
                filename = f"page_{page_num + 1:04d}.png"
                img_path = os.path.join(out_dir, filename)
                pix.save(img_path)
                image_paths.append(f"{rel_dir}/{filename}")
            fitz_doc.close()

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
