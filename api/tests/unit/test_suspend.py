from app.database import SessionLocal
from app.engine.events import signal_event_tx
from app.models.run_step import RunEvent
from tests.helpers import e, make_def, n, run_status, step_status


def test_suspend_parks_run_as_waiting(start, drive_run):
    run_id, _ = start(make_def([n("a"), n("g", "gate")], [e("a", "g")]))
    drive_run(run_id)
    assert step_status(run_id, "g") == "waiting"
    assert run_status(run_id) == "waiting"  # parked, NOT completed
    with SessionLocal() as db:
        ev = db.query(RunEvent).filter(RunEvent.run_id == run_id).first()
    assert ev is not None and ev.status == "armed"


def test_signal_event_resumes_to_completion(start, drive_run):
    run_id, _ = start(make_def([n("a"), n("g", "gate")], [e("a", "g")]))
    drive_run(run_id)
    assert run_status(run_id) == "waiting"

    ready = signal_event_tx("resume", str(run_id))  # external event arrives
    assert ready  # the gate step was made ready

    drive_run(run_id)
    assert step_status(run_id, "g") == "succeeded"
    assert run_status(run_id) == "completed"


def test_signal_with_wrong_match_key_does_not_resume(start, drive_run):
    run_id, _ = start(make_def([n("g", "gate")]))
    drive_run(run_id)
    assert run_status(run_id) == "waiting"

    assert signal_event_tx("resume", "nonexistent-key") == []
    assert run_status(run_id) == "waiting"


def test_event_marked_consumed_after_signal(start, drive_run):
    run_id, _ = start(make_def([n("g", "gate")]))
    drive_run(run_id)
    signal_event_tx("resume", str(run_id))
    with SessionLocal() as db:
        ev = db.query(RunEvent).filter(RunEvent.run_id == run_id).first()
    assert ev.status == "fired"
