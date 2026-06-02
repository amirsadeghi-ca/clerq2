"""Smoke: core validation pipeline.

Verifies the critical path: upload a document → create a policy → trigger a
validate run → run is accepted and reaches a terminal state.

AI calls are mocked so no OpenRouter key is needed and the test is deterministic.
The engine steps are driven synchronously via the `drive_run` fixture from the
parent conftest (same path the Celery worker uses).
"""
import io

# Minimal valid single-page PDF (hand-crafted, ~285 bytes)
_MINIMAL_PDF = (
    b"%PDF-1.0\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj "
    b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj "
    b"3 0 obj<</Type/Page/MediaBox[0 0 3 3]>>endobj "
    b"xref\n0 4\n0000000000 65535 f \n"
    b"0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n"
    b"trailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF"
)

_PASS_PAYLOAD = {
    "results": [
        {
            "rule_name": "Doc is present",
            "status": "pass",
            "requirement": "required",
            "scope": "per_document",
            "evidence": "Document found.",
            "confidence": 0.99,
            "per_document": [],
        }
    ]
}


def _upload(client, auth_headers):
    resp = client.post(
        "/api/documents/upload",
        headers=auth_headers,
        files={"file": ("test.pdf", io.BytesIO(_MINIMAL_PDF), "application/pdf")},
    )
    assert resp.status_code in (200, 201), f"upload failed: {resp.text}"
    return resp.json()["id"]


def test_document_upload(client, auth_headers):
    resp = client.post(
        "/api/documents/upload",
        headers=auth_headers,
        files={"file": ("hello.pdf", io.BytesIO(_MINIMAL_PDF), "application/pdf")},
    )
    assert resp.status_code in (200, 201)
    data = resp.json()
    assert data["id"]
    assert data["original_filename"] == "hello.pdf"


def test_validate_run_created(client, auth_headers, smoke_policy_id):
    doc_id = _upload(client, auth_headers)
    resp = client.post(
        "/api/validate/run",
        headers=auth_headers,
        json={"policy_id": smoke_policy_id, "document_id": doc_id},
    )
    assert resp.status_code in (200, 201), f"validate/run failed: {resp.text}"
    run = resp.json()
    assert run["id"]
    assert run["status"] in ("pending", "running", "completed", "failed")


def test_validate_run_completes(client, auth_headers, smoke_policy_id, smoke_openrouter_key,
                                drive_run, mock_openrouter):
    mock_openrouter["payload"] = _PASS_PAYLOAD
    doc_id = _upload(client, auth_headers)

    # Trigger via HTTP
    resp = client.post(
        "/api/validate/run",
        headers=auth_headers,
        json={"policy_id": smoke_policy_id, "document_id": doc_id},
    )
    assert resp.status_code in (200, 201), f"validate/run failed: {resp.text}"
    run_id = resp.json()["id"]

    # Drive all steps synchronously (bypasses Celery — same code path)
    drive_run(run_id)

    # Verify terminal state via HTTP
    resp = client.get(f"/api/runs/{run_id}", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] in ("completed", "failed"), f"run stuck in: {data['status']}"
