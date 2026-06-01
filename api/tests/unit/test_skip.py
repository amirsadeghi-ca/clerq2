from tests.helpers import e, make_def, n, run_status, step_status


def _cond_graph_with_join():
    # a -> cond ; cond -(true)-> t ; cond -(false)-> f ; t,f -> j
    return make_def(
        [n("a"),
         n("cond", "condition", field="branch", op="eq", value="go"),
         n("t"), n("f"), n("j")],
        [e("a", "cond"),
         e("cond", "t", "true"), e("cond", "f", "false"),
         e("t", "j"), e("f", "j")],
    )


def test_true_branch_prunes_and_skips_false_join_survives(start, drive_run):
    run_id, _ = start(_cond_graph_with_join(), context_overrides={"branch": "go"})
    drive_run(run_id)
    assert step_status(run_id, "t") == "succeeded"
    assert step_status(run_id, "f") == "skipped"
    assert step_status(run_id, "j") == "succeeded"  # join survives a partial skip
    assert run_status(run_id) == "completed"


def test_false_branch(start, drive_run):
    run_id, _ = start(_cond_graph_with_join(), context_overrides={"branch": "stop"})
    drive_run(run_id)
    assert step_status(run_id, "t") == "skipped"
    assert step_status(run_id, "f") == "succeeded"
    assert step_status(run_id, "j") == "succeeded"
    assert run_status(run_id) == "completed"


def test_skip_propagates_transitively(start, drive_run):
    # cond -(false)-> dead -> dead2 ; the whole false chain must skip.
    definition = make_def(
        [n("a"), n("cond", "condition", field="branch", op="eq", value="go"),
         n("live"), n("dead"), n("dead2")],
        [e("a", "cond"),
         e("cond", "live", "true"),
         e("cond", "dead", "false"), e("dead", "dead2")],
    )
    run_id, _ = start(definition, context_overrides={"branch": "go"})
    drive_run(run_id)
    assert step_status(run_id, "live") == "succeeded"
    assert step_status(run_id, "dead") == "skipped"
    assert step_status(run_id, "dead2") == "skipped"  # transitive skip
    assert run_status(run_id) == "completed"
