from app.engine import scheduler
from tests.helpers import make_def, n, step_by_node


def test_duplicate_execute_is_noop(start):
    """A redelivered execute_step must not run the handler twice — the claim CAS
    makes the second call a no-op."""
    run_id, ready = start(make_def([n("a")]))
    sid = ready[0]

    scheduler.process_step(sid, "w1")
    s1 = step_by_node(run_id, "a")
    assert s1.status == "succeeded"
    attempt1, out1 = s1.attempt, s1.output_data

    second = scheduler.process_step(sid, "w2")
    assert second is None  # not claimable → no-op

    s2 = step_by_node(run_id, "a")
    assert s2.status == "succeeded"
    assert s2.attempt == attempt1
    assert s2.output_data == out1
