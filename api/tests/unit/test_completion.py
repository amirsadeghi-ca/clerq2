from tests.helpers import all_steps, e, make_def, n, run_result, run_status


def test_completes_with_no_terminal_node(start, drive_run):
    # Plain a -> b chain; no show_results / output node. The OLD engine would
    # never complete (it relied on a terminal node calling mark_run_done).
    run_id, _ = start(make_def([n("a"), n("b")], [e("a", "b")]))
    drive_run(run_id)
    assert run_status(run_id) == "completed"


def test_single_node_run_completes(start, drive_run):
    run_id, _ = start(make_def([n("only")]))
    drive_run(run_id)
    assert run_status(run_id) == "completed"


def test_run_result_is_leaf_output(start, drive_run):
    run_id, _ = start(make_def([n("a"), n("b")], [e("a", "b")]))
    drive_run(run_id)
    res = run_result(run_id)
    assert res is not None
    assert res.get("_echo_trail") == ["a", "b"]  # b is the leaf


def test_failed_step_fails_run_under_fail_run(start, drive_run):
    run_id, _ = start(make_def([n("a"), n("x", "boom")], [e("a", "x")]))
    drive_run(run_id)
    assert run_status(run_id) == "failed"
    assert all_steps(run_id)["x"] == "failed"


def test_failsoft_persists_output_and_fails_run(start, drive_run):
    run_id, _ = start(make_def([n("x", "failsoft")]))
    drive_run(run_id)
    assert run_status(run_id) == "failed"
    from tests.helpers import step_by_node
    x = step_by_node(run_id, "x")
    assert x.status == "failed"
    assert x.output_data == {"partial": True, "node": "x"}  # partial output persisted
