from app.database import SessionLocal
from app.engine import scheduler
from app.models.run_step import RunStep
from tests.helpers import e, make_def, n, run_status, step_by_node

# a -> b, a -> c, b -> d, c -> d  (classic fan-out + join)
DIAMOND = make_def(
    [n("a"), n("b"), n("c"), n("d")],
    [e("a", "b"), e("a", "c"), e("b", "d"), e("c", "d")],
)


def _process(run_id, node_id):
    s = step_by_node(run_id, node_id)
    scheduler.process_step(s.id, "test")
    return scheduler.advance_run_tx(run_id)


def test_join_waits_for_all_parents(start):
    run_id, _ = start(DIAMOND)
    _process(run_id, "a")
    assert step_by_node(run_id, "b").status == "ready"
    assert step_by_node(run_id, "c").status == "ready"

    _process(run_id, "b")  # only one parent done → join must wait
    d = step_by_node(run_id, "d")
    assert d.status == "pending"
    assert d.deps_remaining == 1

    _process(run_id, "c")  # both parents done → join ready
    assert step_by_node(run_id, "d").status == "ready"


def test_two_parents_ready_join_exactly_once(start):
    run_id, _ = start(DIAMOND)
    _process(run_id, "a")
    _process(run_id, "b")
    _process(run_id, "c")
    with SessionLocal() as db:
        rows = db.query(RunStep).filter(
            RunStep.run_id == run_id, RunStep.node_id == "d").all()
    assert len(rows) == 1  # no duplicate readying
    assert rows[0].deps_remaining == 0


def test_join_merges_both_parent_outputs(start, drive_run):
    run_id, _ = start(DIAMOND)
    drive_run(run_id)
    assert run_status(run_id) == "completed"
    d = step_by_node(run_id, "d")
    assert d.status == "succeeded"
    assert {"b", "c"}.issubset(d.inputs.keys())  # both parents fed the join
    assert "_run" in d.inputs                    # seed preserved
