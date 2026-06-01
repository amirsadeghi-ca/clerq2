import threading

from app.database import SessionLocal
from app.engine import scheduler
from tests.helpers import make_def, n, step_by_node


def test_claim_happy_path(start):
    run_id, ready = start(make_def([n("a")]))
    assert len(ready) == 1
    with SessionLocal() as db:
        claimed = scheduler.claim_ready_step(db, ready[0], "w1")
    assert claimed is not None
    assert step_by_node(run_id, "a").status == "running"


def test_double_claim_returns_none(start):
    run_id, ready = start(make_def([n("a")]))
    with SessionLocal() as db:
        first = scheduler.claim_ready_step(db, ready[0], "w1")
    with SessionLocal() as db:
        second = scheduler.claim_ready_step(db, ready[0], "w2")
    assert first is not None
    assert second is None


def test_concurrent_claims_exactly_one_wins(start):
    _run_id, ready = start(make_def([n("a")]))
    step_id = ready[0]
    results: list[bool] = []
    lock = threading.Lock()

    def worker():
        with SessionLocal() as db:
            claimed = scheduler.claim_ready_step(db, step_id, "w")
        with lock:
            results.append(claimed is not None)

    threads = [threading.Thread(target=worker) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert sum(results) == 1  # SKIP LOCKED + status CAS → exactly one winner
