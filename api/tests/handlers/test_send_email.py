from app.database import SessionLocal
from app.engine import scheduler
from app.models.mail import MailMessage
from tests.helpers import make_def, n, run_status, step_by_node


def _outbound(run_id):
    with SessionLocal() as db:
        return db.query(MailMessage).filter(
            MailMessage.run_id == run_id, MailMessage.direction == "outbound").all()


def test_send_email_records_message(start, drive_run):
    run_id, _ = start(
        make_def([n("se", "send_email", to="dest@example.com", subject="Hi", body="Body")]))
    drive_run(run_id)
    assert run_status(run_id) == "completed"
    msgs = _outbound(run_id)
    assert len(msgs) == 1
    assert msgs[0].to_addr == "dest@example.com"
    assert msgs[0].subject == "Hi"


def test_send_email_requires_to(start, drive_run):
    run_id, _ = start(make_def([n("se", "send_email", subject="Hi", body="Body")]))
    drive_run(run_id)
    assert run_status(run_id) == "failed"
    assert step_by_node(run_id, "se").status == "failed"


def test_send_email_idempotent_on_reprocess(start, drive_run):
    run_id, ready = start(make_def([n("se", "send_email", to="dest@example.com", subject="Hi")]))
    drive_run(run_id)
    # Simulate a redelivery of the same (succeeded) step — claim CAS makes it a
    # no-op, and even if it ran, the external_id marker dedups.
    scheduler.process_step(ready[0], "dup")
    assert len(_outbound(run_id)) == 1
