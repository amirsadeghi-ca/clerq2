"""Smoke-test fixtures.

Tests hit the real FastAPI app through TestClient, exercising the full
HTTP → router → DB stack against the interpret_test Postgres database.

The parent conftest (tests/conftest.py) is auto-loaded: it builds the schema
once per session and truncates execution tables before each test. This file
adds an HTTP client + a seeded owner user in a dedicated smoke tenant.
"""
from __future__ import annotations

import bcrypt
import pytest
from starlette.testclient import TestClient

from app.database import SessionLocal
from app.main import app
from app.models.auth import AuthIdentity, Tenant, User
from app.models.policy import Policy, PolicyRule
from app.models.setting import AppSetting

_SMOKE_EMAIL = "smoke@interpret.local"
_SMOKE_PASSWORD = "SmokeTest!123"


@pytest.fixture(scope="session")
def smoke_tenant_id(_schema) -> int:
    with SessionLocal() as db:
        t = Tenant(name="Smoke Tenant", slug="smoke", is_active=True)
        db.add(t)
        db.flush()
        tid = t.id
        db.commit()
    return tid


@pytest.fixture(scope="session")
def smoke_user(smoke_tenant_id) -> dict:
    pw_hash = bcrypt.hashpw(_SMOKE_PASSWORD[:72].encode(), bcrypt.gensalt()).decode()
    with SessionLocal() as db:
        user = User(
            tenant_id=smoke_tenant_id,
            email=_SMOKE_EMAIL,
            display_name="Smoke Tester",
            role="owner",
            is_active=True,
        )
        db.add(user)
        db.flush()
        db.add(AuthIdentity(user_id=user.id, provider="password", secret=pw_hash))
        db.commit()
        return {"email": _SMOKE_EMAIL, "password": _SMOKE_PASSWORD, "tenant_id": smoke_tenant_id}


@pytest.fixture(scope="session")
def client(_schema) -> TestClient:
    return TestClient(app, raise_server_exceptions=True)


@pytest.fixture()
def smoke_policy_id(smoke_tenant_id) -> int:
    """A single-rule policy in the smoke tenant — recreated per test (clean state)."""
    with SessionLocal() as db:
        p = Policy(
            tenant_id=smoke_tenant_id,
            name="Smoke Policy",
            brief="Smoke test policy",
            current_version_num=1,
            email_reply_mode="always",
        )
        db.add(p)
        db.flush()
        db.add(PolicyRule(
            policy_id=p.id, position=0,
            name="Doc is present", requirement="required", scope="per_document",
        ))
        db.commit()
        return p.id


@pytest.fixture()
def smoke_openrouter_key(smoke_tenant_id) -> str:
    """Set a dummy OpenRouter key for the smoke tenant so validate runs don't bail early."""
    key = "smoke-test-key"
    with SessionLocal() as db:
        db.merge(AppSetting(tenant_id=smoke_tenant_id, key="openrouter_api_key", value=key))
        db.commit()
    return key


@pytest.fixture(scope="session")
def auth_headers(client: TestClient, smoke_user: dict) -> dict:
    resp = client.post("/api/auth/login", json={
        "email": smoke_user["email"],
        "password": smoke_user["password"],
    })
    assert resp.status_code == 200, f"smoke login failed: {resp.text}"
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}
