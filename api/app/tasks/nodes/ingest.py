import os

from app.tasks.celery_app import celery_app
from app.tasks.nodes.base import mark_step_running, mark_step_done, mark_step_failed, mark_run_failed, step_log, raise_if_cancelled


@celery_app.task(name="nodes.ingest", bind=True)
def ingest_task(self, input_data: dict, run_id: int, step_id: int, node_config: dict | None = None) -> dict:
    mark_step_running(step_id)
    try:
        raise_if_cancelled(run_id)
        file_path = input_data["file_path"]
        document_id = input_data["document_id"]
        mime_type = input_data.get("mime_type")

        step_log(step_id, f"Document ID: {document_id}")
        step_log(step_id, f"File: {os.path.basename(file_path)} ({mime_type or 'unknown type'})")

        output: dict = {
            "document_id": document_id,
            "file_path": file_path,
            "mime_type": mime_type,
        }
        # Pass the multi-doc list through if present (set by executor for multi-doc runs)
        if "documents" in input_data:
            output["documents"] = input_data["documents"]
        mark_step_done(step_id, output)
        return output
    except Exception as exc:
        mark_step_failed(step_id, str(exc))
        mark_run_failed(run_id, str(exc))
        raise
