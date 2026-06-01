from celery import Celery
from app.config import settings

# Import all ORM models so SQLAlchemy's FK graph is complete in the worker process
import app.models.workflow          # noqa: F401
import app.models.workflow_version  # noqa: F401
import app.models.document          # noqa: F401
import app.models.run               # noqa: F401
import app.models.run_step          # noqa: F401
import app.models.document_type     # noqa: F401
import app.models.policy            # noqa: F401
import app.models.setting           # noqa: F401
import app.models.mail              # noqa: F401
import app.models.reference_list    # noqa: F401
import app.models.auth              # noqa: F401
import app.models.case              # noqa: F401

celery_app = Celery(
    "interpret",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=[
        "app.tasks.nodes.ingest",
        "app.tasks.nodes.pdf_to_images",
        "app.tasks.nodes.output",
        "app.tasks.nodes.validate_documents",
        "app.tasks.nodes.show_results",
        "app.tasks.nodes.email_input",
        "app.tasks.nodes.ai",
        "app.tasks.nodes.send_email",
        # Execution engine v2 (generic step/advance tasks; reconciler added in Phase 1)
        "app.engine.tasks",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    worker_prefetch_multiplier=1,
)

# Execution-engine-v2 reconciler: beat fires engine.sweep on an interval; the
# worker runs it (requeue expired leases, fire due timers, re-derive stranded work).
celery_app.conf.beat_schedule = {
    "engine-sweep": {
        "task": "engine.sweep",
        "schedule": 10.0,  # seconds
    },
}
