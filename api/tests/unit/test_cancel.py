from app.database import SessionLocal
from app.engine import scheduler
from tests.helpers import all_steps, e, make_def, n, run_status


def test_cancel_marks_run_and_steps_cancelled(start):
    run_id, _ = start(make_def([n("a"), n("b")], [e("a", "b")]))
    with SessionLocal() as db:
        scheduler.cancel_run(db, run_id)
    assert run_status(run_id) == "cancelled"
    assert set(all_steps(run_id).values()) == {"cancelled"}


def test_cancel_is_distinct_from_failed(start):
    run_id, _ = start(make_def([n("a")]))
    with SessionLocal() as db:
        scheduler.cancel_run(db, run_id)
    assert run_status(run_id) == "cancelled"  # D4: cancelled, never "failed"


def test_cancelled_run_does_not_execute_further(start, drive_run):
    run_id, _ = start(make_def([n("a"), n("b")], [e("a", "b")]))
    with SessionLocal() as db:
        scheduler.cancel_run(db, run_id)
    processed = drive_run(run_id)
    assert processed == 0
    assert run_status(run_id) == "cancelled"
