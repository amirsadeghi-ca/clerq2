"""Smoke: health and readiness endpoints."""


def test_health_liveness(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_readiness_shape(client):
    """Readiness endpoint returns the expected keys regardless of state."""
    resp = client.get("/api/health/readiness")
    assert resp.status_code == 200
    data = resp.json()
    assert "ok" in data
    assert "checks" in data
    required_checks = {"database", "redis", "openrouter", "email", "secret_key"}
    assert required_checks.issubset(data["checks"].keys())
    for name, check in data["checks"].items():
        assert "ok" in check, f"check '{name}' missing 'ok' field"


def test_readiness_database_ok(client):
    """Database check must pass — test DB is always reachable."""
    resp = client.get("/api/health/readiness")
    assert resp.json()["checks"]["database"]["ok"] is True


def test_readiness_redis_ok(client):
    """Redis check must pass — test stack has Redis running."""
    resp = client.get("/api/health/readiness")
    assert resp.json()["checks"]["redis"]["ok"] is True
