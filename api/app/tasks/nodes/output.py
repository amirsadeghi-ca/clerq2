import os
import shutil
from datetime import datetime, UTC

from app.config import settings
from app.tasks.celery_app import celery_app
from app.tasks.nodes.base import mark_step_running, mark_step_done, mark_step_failed, mark_run_failed, mark_run_done, step_log, raise_if_cancelled


@celery_app.task(name="nodes.output", bind=True)
def output_task(self, input_data: dict, run_id: int, step_id: int, node_config: dict | None = None) -> dict:
    mark_step_running(step_id)
    try:
        raise_if_cancelled(run_id)
        cfg = node_config or {}
        output_folder = (cfg.get("output_folder") or "").strip()

        image_paths = input_data.get("image_paths", [])
        step_log(step_id, f"Collecting results — {len(image_paths)} image(s)")

        if output_folder:
            step_log(step_id, f"Copying files to output folder: {output_folder}")
            _copy_to_output_folder(input_data, output_folder, run_id)
            step_log(step_id, "Copy complete")
        else:
            step_log(step_id, "No output folder configured — skipping copy")

        manifest = {
            "completed_at": datetime.now(UTC).isoformat(),
            "output_folder": output_folder or None,
            "results": input_data,
        }
        output = {"manifest": manifest, "status": "complete"}
        mark_step_done(step_id, output)
        mark_run_done(run_id)
        return output
    except Exception as exc:
        mark_step_failed(step_id, str(exc))
        mark_run_failed(run_id, str(exc))
        raise


def _copy_to_output_folder(input_data: dict, output_folder: str, run_id: int) -> None:
    storage_root = os.path.realpath(settings.storage_path)
    dest_root = os.path.realpath(output_folder)

    # Destination must be under STORAGE_PATH to stay contained
    if not dest_root.startswith(storage_root):
        dest_root = os.path.join(storage_root, "output", os.path.basename(output_folder))

    dest_dir = os.path.join(dest_root, f"run_{run_id}")
    os.makedirs(dest_dir, exist_ok=True)

    for rel_path in input_data.get("image_paths", []):
        src = os.path.join(storage_root, rel_path)
        if os.path.isfile(src):
            shutil.copy2(src, dest_dir)
