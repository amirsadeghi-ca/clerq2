"""Golden output-shape contract for validate_documents — the cross-system
contract (cases.py / ReportView / review all depend on this exact shape)."""
from tests.helpers import make_def, n, run_status, step_by_node

TXT = [{"id": 1, "filename": "a.txt", "text_content": "a signed document", "image_paths": []}]


def _vdef(pid):
    return make_def([n("v", "validate_documents", policy_id=pid)])


def test_output_contract_pass(start, drive_run, policy_factory, openrouter_key, mock_openrouter):
    pid = policy_factory([("Has signature", "required", "per_document")])
    mock_openrouter["payload"] = {"results": [
        {"rule_name": "Has signature", "requirement": "required",
         "status": "pass", "confidence": 0.9, "evidence": "It is signed."}
    ]}
    run_id, _ = start(_vdef(pid), docs=TXT)
    drive_run(run_id)

    out = step_by_node(run_id, "v").output_data
    assert out["overall"] == "pass"
    assert out["policy_id"] == pid
    assert "policy_version_num" in out
    assert "image_paths" in out
    r = out["results"][0]
    assert r["rule_name"] == "Has signature"
    assert r["status"] == "pass"
    assert r["scope"] == "per_document"
    assert r["requirement"] == "required"
    assert "per_document" in r  # per-document breakdown present


def test_required_fail_sets_overall_fail(start, drive_run, policy_factory, openrouter_key, mock_openrouter):
    pid = policy_factory([("Rule", "required", "per_document")])
    mock_openrouter["payload"] = {"results": [
        {"rule_name": "Rule", "requirement": "required", "status": "fail",
         "confidence": 0.9, "evidence": "missing"}
    ]}
    run_id, _ = start(_vdef(pid), docs=TXT)
    drive_run(run_id)
    assert step_by_node(run_id, "v").output_data["overall"] == "fail"


def test_not_applicable_on_required_becomes_missing_fail(
        start, drive_run, policy_factory, openrouter_key, mock_openrouter):
    # The only doc is n/a for this required rule → required document is absent → fail.
    pid = policy_factory([("Passport valid", "required", "per_document")])
    mock_openrouter["payload"] = {"results": [
        {"rule_name": "Passport valid", "requirement": "required", "status": "not_applicable",
         "confidence": 0.9, "evidence": "This is a utility bill, not a passport."}
    ]}
    run_id, _ = start(_vdef(pid), docs=TXT)
    drive_run(run_id)
    out = step_by_node(run_id, "v").output_data
    assert out["overall"] == "fail"
    assert "No document in the packet matches this rule" in out["results"][0]["evidence"]


def test_optional_uncertain_does_not_fail_overall(
        start, drive_run, policy_factory, openrouter_key, mock_openrouter):
    pid = policy_factory([("Nice to have", "optional", "per_document")])
    mock_openrouter["payload"] = {"results": [
        {"rule_name": "Nice to have", "requirement": "optional", "status": "uncertain",
         "confidence": 0.5, "evidence": "unsure"}
    ]}
    run_id, _ = start(_vdef(pid), docs=TXT)
    drive_run(run_id)
    assert step_by_node(run_id, "v").output_data["overall"] == "pass"


def test_cross_set_rule_tagged_and_uses_db_requirement(
        start, drive_run, policy_factory, openrouter_key, mock_openrouter):
    # An OPTIONAL cross-set rule whose AI leaks free text into `requirement` must
    # still carry the authoritative DB requirement ("optional"), or review would
    # wrongly treat it as required.
    pid = policy_factory([("Names consistent", "optional", "cross_set")])
    mock_openrouter["payload"] = {"results": [
        {"rule_name": "Names consistent", "requirement": "the names should match",
         "status": "pass", "confidence": 0.9, "evidence": "all agree"}
    ]}
    docs = [
        {"id": 1, "filename": "a.txt", "text_content": "John Smith", "image_paths": []},
        {"id": 2, "filename": "b.txt", "text_content": "John Smith", "image_paths": []},
    ]
    run_id, _ = start(_vdef(pid), docs=docs)
    drive_run(run_id)
    r = step_by_node(run_id, "v").output_data["results"][0]
    assert r["scope"] == "cross_set"
    assert r["requirement"] == "optional"  # DB value, not the AI's free text
    assert len(r["per_document"]) == 2     # documents compared
