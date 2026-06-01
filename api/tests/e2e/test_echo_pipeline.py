from tests.helpers import (
    all_steps, e, make_def, n, run_result, run_status, step_by_node, step_status,
)


def test_linear_fanout_join_pipeline(start, drive_run):
    # input -> p2 -> {A, B} -> join -> out   (all echo)
    definition = make_def(
        [n("input"), n("p2"), n("A"), n("B"), n("join"), n("out")],
        [e("input", "p2"),
         e("p2", "A"), e("p2", "B"),
         e("A", "join"), e("B", "join"),
         e("join", "out")],
    )
    run_id, _ = start(definition)
    processed = drive_run(run_id)

    assert run_status(run_id) == "completed"
    assert set(all_steps(run_id).values()) == {"succeeded"}
    assert processed == 6  # every node ran exactly once

    j = step_by_node(run_id, "join")
    assert {"A", "B"}.issubset(j.inputs.keys())  # fan-in delivered both

    res = run_result(run_id)
    assert res is not None and "_echo_trail" in res  # leaf 'out' output


def test_pipeline_with_conditional_skip(start, drive_run):
    # input -> v -> cond ; cond -(true)-> gate ; cond -(false)-> done
    definition = make_def(
        [n("input"), n("v"),
         n("cond", "condition", field="overall", op="eq", value="fail"),
         n("gate"), n("done")],
        [e("input", "v"), e("v", "cond"),
         e("cond", "gate", "true"), e("cond", "done", "false")],
    )
    # No 'overall' in the data → predicate is False → 'false' edge → done runs.
    run_id, _ = start(definition)
    drive_run(run_id)
    assert step_status(run_id, "done") == "succeeded"
    assert step_status(run_id, "gate") == "skipped"
    assert run_status(run_id) == "completed"
