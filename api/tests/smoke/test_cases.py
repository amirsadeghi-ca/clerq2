"""Smoke: cases (dossiers) — basic CRUD and status transitions."""


def test_cases_list(client, auth_headers):
    resp = client.get("/api/cases/", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_cases_list_unauthenticated(client):
    resp = client.get("/api/cases/")
    assert resp.status_code == 401


def test_case_create_and_fetch(client, auth_headers):
    resp = client.post("/api/cases/", headers=auth_headers, json={
        "name": "Smoke Test Dossier",
        "contact_email": "applicant@smoke.invalid",
    })
    assert resp.status_code in (200, 201), f"create failed: {resp.text}"
    case = resp.json()
    assert case["id"]
    assert case["name"] == "Smoke Test Dossier"

    # Fetch by id
    resp2 = client.get(f"/api/cases/{case['id']}", headers=auth_headers)
    assert resp2.status_code == 200
    assert resp2.json()["id"] == case["id"]


def test_case_status_update(client, auth_headers):
    create = client.post("/api/cases/", headers=auth_headers, json={
        "name": "Status Smoke Case",
    }).json()

    case_id = create["id"]
    resp = client.patch(f"/api/cases/{case_id}", headers=auth_headers, json={
        "status": "under_review",
    })
    assert resp.status_code == 200
    assert resp.json()["status"] == "under_review"


def test_case_not_found(client, auth_headers):
    resp = client.get("/api/cases/9999999", headers=auth_headers)
    assert resp.status_code == 404
