"""`output` node — collect results into a manifest; optionally copy rendered
images into an output folder (under the storage root) via ctx.storage."""
from __future__ import annotations

from datetime import UTC, datetime

from app.engine.context import Output, StepContext


def output_node(ctx: StepContext) -> Output:
    cfg = ctx.config or {}
    folder = (cfg.get("output_folder") or "").strip()
    data = ctx.primary_input()
    image_paths = data.get("image_paths", []) or []

    if folder:
        ctx.log(f"Copying {len(image_paths)} file(s) → output/{folder}")
        dest_dir = f"output/{folder}/run_{ctx.run_id}"
        for rel in image_paths:
            try:
                ctx.storage.copy(rel, f"{dest_dir}/{rel.rsplit('/', 1)[-1]}")
            except (FileNotFoundError, ValueError):
                pass
    else:
        ctx.log("No output folder configured — skipping copy")

    manifest = {
        "completed_at": datetime.now(UTC).isoformat(),
        "output_folder": folder or None,
        "results": data,
    }
    return Output({"manifest": manifest, "status": "complete"})
