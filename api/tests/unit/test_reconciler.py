from datetime import timedelta

from app.database import SessionLocal
from app.engine import reconciler, scheduler
from app.engine.scheduler import _utcnow
from app.models.run_step import RunStep
from tests.helpers import e, make_def, n, run_status, step_status


def test_fire_due_timer_resumes_waiting_step(start, drive_run):
    # gate suspends with a timer already in the past → reconciler fires it
    run_id, _ = start(make_def([n("g", "gate", timer_seconds=-5)]))
    drive_run(run_id)
    assert run_status(run_id) == "waiting"

    with SessionLocal() as db:
        fired = reconciler.fire_due_timers(db)
        db.commit()
    assert fired  # timer was due

    drive_run(run_id)
    assert step_status(run_id, "g") == "succeeded"
    assert run_status(run_id) == "completed"


def test_timer_not_yet_due_does_not_fire(start, drive_run):
    run_id, _ = start(make_def([n("g", "gate", timer_seconds=3600)]))
    drive_run(run_id)
    with SessionLocal() as db:
        fired = reconciler.fire_due_timers(db)
        db.commit()
    assert fired == []
    assert run_status(run_id) == "waiting"


def test_reclaim_expired_lease_requeues_running_step(start):
    run_id, ready = start(make_def([n("a")]))
    with SessionLocal() as db:
        scheduler.claim_ready_step(db, ready[0], "deadworker")  # → running
    # Simulate the worker dying: expire the lease.
    with SessionLocal() as db:
        s = db.get(RunStep, ready[0])
        s.lease_expires_at = _utcnow() - timedelta(seconds=1)
        db.commit()
    with SessionLocal() as db:
        reclaimed = reconciler.reclaim_expired_leases(db)
        db.commit()
    assert ready[0] in reclaimed
    assert step_status(run_id, "a") == "ready"


def test_live_lease_is_not_reclaimed(start):
    _run_id, ready = start(make_def([n("a")]))
    with SessionLocal() as db:
        scheduler.claim_ready_step(db, ready[0], "w")  # lease in the future
    with SessionLocal() as db:
        reclaimed = reconciler.reclaim_expired_leases(db)
        db.commit()
    assert reclaimed == []


def test_sweep_surfaces_stranded_ready(start):
    _run_id, ready = start(make_def([n("a"), n("b")], [e("a", "b")]))
    # 'a' is ready but its enqueue message was "lost"; the sweep re-derives it.
    assert ready[0] in reconciler.sweep()
