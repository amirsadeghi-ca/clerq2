"""End-to-end canonical Validate pipeline on the new engine."""
from tests.helpers import e, make_def, n, run_result, run_status, step_status

TXT = [{"id": 1, "filename": "a.txt", "text_content": "hello world", "image_paths": []}]


def _pass(rule="Rule A"):
    return {"results": [{"rule_name": rule, "requirement": "required",
                         "status": "pass", "confidence": 1.0, "evidence": "ok"}]}


def test_canonical_pipeline_completes_with_verdict(
        start, drive_run, policy_factory, openrouter_key, mock_openrouter):
    pid = policy_factory([("Rule A", "required", "per_document")])
    mock_openrouter["payload"] = _pass()
    definition = make_def(
        [n("in", "input"), n("v", "validate_documents", policy_id=pid), n("sr", "show_results")],
        [e("in", "v"), e("v", "sr")],
    )
    run_id, _ = start(definition, docs=TXT)
    drive_run(run_id)

    assert run_status(run_id) == "completed"
    assert step_status(run_id, "sr") == "succeeded"
    res = run_result(run_id)
    assert res is not None and res["overall"] == "pass"


def test_verdict_without_show_results(
        start, drive_run, policy_factory, openrouter_key, mock_openrouter):
    # No show_results / output node — the run still completes and run.result is
    # the validate leaf's verdict (the old engine could never finish this).
    pid = policy_factory([("Rule A", "required", "per_document")])
    mock_openrouter["payload"] = _pass()
    definition = make_def([n("in", "input"), n("v", "validate_documents", policy_id=pid)],
                          [e("in", "v")])
    run_id, _ = start(definition, docs=TXT)
    drive_run(run_id)

    assert run_status(run_id) == "completed"
    res = run_result(run_id)
    assert res is not None and res["overall"] == "pass"


def test_fail_on_missing_fails_run_but_persists_output(
        start, drive_run, policy_factory, openrouter_key, mock_openrouter):
    pid = policy_factory([("Rule A", "required", "per_document")])
    mock_openrouter["payload"] = {"results": [
        {"rule_name": "Rule A", "requirement": "required", "status": "fail",
         "confidence": 1.0, "evidence": "nope"}]}
    definition = make_def(
        [n("in", "input"), n("v", "validate_documents", policy_id=pid, fail_on_missing=True)],
        [e("in", "v")])
    run_id, _ = start(definition, docs=TXT)
    drive_run(run_id)

    assert run_status(run_id) == "failed"
    v = step_status(run_id, "v")
    assert v == "failed"
    # Output still persisted despite the failure (so the report renders).
    from tests.helpers import step_by_node
    assert step_by_node(run_id, "v").output_data["overall"] == "fail"
