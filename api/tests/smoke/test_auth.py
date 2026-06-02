"""Smoke: authentication — login, /me, token refresh, logout."""


def test_login_success(client, smoke_user):
    resp = client.post("/api/auth/login", json={
        "email": smoke_user["email"],
        "password": smoke_user["password"],
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["access_token"]


def test_login_wrong_password(client, smoke_user):
    resp = client.post("/api/auth/login", json={
        "email": smoke_user["email"],
        "password": "wrong",
    })
    assert resp.status_code == 401


def test_login_unknown_user(client):
    resp = client.post("/api/auth/login", json={
        "email": "nobody@nowhere.invalid",
        "password": "irrelevant",
    })
    assert resp.status_code == 401


def test_me_authenticated(client, auth_headers, smoke_user):
    resp = client.get("/api/auth/me", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["user"]["email"] == smoke_user["email"]
    assert data["user"]["role"] == "owner"


def test_me_unauthenticated(client):
    resp = client.get("/api/auth/me")
    assert resp.status_code == 401


def test_token_refresh(client, smoke_user):
    login = client.post("/api/auth/login", json={
        "email": smoke_user["email"],
        "password": smoke_user["password"],
    }).json()

    resp = client.post("/api/auth/refresh", json={"refresh_token": login["refresh_token"]})
    assert resp.status_code == 200
    new = resp.json()
    assert "access_token" in new
    # new token must be different (rotation)
    assert new["access_token"] != login["access_token"]
