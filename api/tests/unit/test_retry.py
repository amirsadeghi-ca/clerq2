from tests.helpers import make_def, n, run_status, step_by_node


def test_step_retries_then_succeeds(start, drive_run):
    run_id, _ = start(make_def([n("f", "flaky", max_attempts=2)]))
    drive_run(run_id)
    s = step_by_node(run_id, "f")
    assert s.status == "succeeded"
    assert s.attempt == 2  # failed once, retried, succeeded
    assert run_status(run_id) == "completed"


def test_step_fails_after_exhausting_attempts(start, drive_run):
    run_id, _ = start(make_def([n("x", "boom", max_attempts=2)]))
    drive_run(run_id)
    s = step_by_node(run_id, "x")
    assert s.status == "failed"
    assert s.attempt == 2  # tried twice, then gave up
    assert run_status(run_id) == "failed"


def test_no_retry_by_default(start, drive_run):
    run_id, _ = start(make_def([n("x", "boom")]))  # max_attempts defaults to 1
    drive_run(run_id)
    s = step_by_node(run_id, "x")
    assert s.status == "failed"
    assert s.attempt == 1
