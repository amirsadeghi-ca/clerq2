"""show_results: run.result population, email reply gating + idempotency."""
from app.database import SessionLocal
from app.engine.context import StepContext
from app.engine.handlers.show_results import _send_reply
from app.engine.storage import get_storage
from app.models.mail import MailMessage
from tests.helpers import make_def, n, run_result, run_status


def _outbound(run_id):
    with SessionLocal() as db:
        return db.query(MailMessage).filter(
            MailMessage.run_id == run_id, MailMessage.direction == "outbound").all()


def test_show_results_populates_run_result(start, drive_run):
    run_id, _ = start(make_def([n("sr", "show_results")]),
                      context_overrides={"overall": "pass", "results": []})
    drive_run(run_id)
    assert run_status(run_id) == "completed"
    assert run_result(run_id)["overall"] == "pass"


def test_reply_recorded_for_policy_run(start, drive_run, policy_factory):
    pid = policy_factory([("R", "required", "per_document")], reply_mode="always")
    run_id, _ = start(make_def([n("sr", "show_results")]),
                      context_overrides={"overall": "pass", "results": []},
                      sender_email="user@interpret.local", policy_id=pid)
    drive_run(run_id)
    msgs = _outbound(run_id)
    assert len(msgs) == 1
    assert msgs[0].external_id.startswith("reply:")


def test_reply_mode_never_sends_nothing(start, drive_run, policy_factory):
    pid = policy_factory([("R", "required", "per_document")], reply_mode="never")
    run_id, _ = start(make_def([n("sr", "show_results")]),
                      context_overrides={"overall": "pass", "results": []},
                      sender_email="user@interpret.local", policy_id=pid)
    drive_run(run_id)
    assert _outbound(run_id) == []


def test_reply_is_idempotent(start, policy_factory):
    """Re-invoking _send_reply with the same idempotency_key sends exactly once."""
    pid = policy_factory([("R", "required", "per_document")], reply_mode="always")
    run_id, _ = start(make_def([n("sr", "show_results")]),
                      context_overrides={"overall": "pass", "results": []},
                      sender_email="user@interpret.local", policy_id=pid)
    from tests.helpers import step_by_node
    step = step_by_node(run_id, "sr")
    ctx = StepContext(
        step_id=step.id, run_id=run_id, tenant_id=step.tenant_id, node_id="sr",
        node_type="show_results", config={}, inputs={}, attempt=1,
        idempotency_key=f"{run_id}:sr:1", storage=get_storage(),
        log=lambda m: None,
    )
    data = {"overall": "pass", "results": []}
    _send_reply(ctx, data)
    _send_reply(ctx, data)  # redelivery
    assert len(_outbound(run_id)) == 1  # marker guard → exactly once
