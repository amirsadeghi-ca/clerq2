"""Pytest fixtures for the execution engine.

Tests run against a real Postgres (the SKIP-LOCKED / advisory-lock behaviour is
the whole point). Point DATABASE_URL at a disposable test database, e.g.:

    DATABASE_URL=postgresql+psycopg://interpret:interpret@postgres:5432/interpret_test \
        pytest -q

The schema is built once per session from the ORM models (create_all on a
pristine `public` schema); engine tables are truncated between tests.
"""
from __future__ import annotations

import threading

import pytest
from sqlalchemy import text

# Bind to whatever DATABASE_URL the test run set (a dedicated test DB).
from app.database import Base, SessionLocal, engine


def _import_all_models() -> None:
    # Populate Base.metadata so create_all builds the full schema.
    from app.models import (  # noqa: F401
        auth, case, document, document_type, mail, policy,
        reference_list, run, run_step, setting, workflow, workflow_version,
    )


# Per-step call counts for the synthetic `gate` handler (reset between tests).
GATE_CALLS: dict[int, int] = {}


def _register_test_handlers() -> None:
    """Register a few synthetic node types used only by the engine tests."""
    from datetime import timedelta

    from app.engine.context import Output, StepFailed, Suspend
    from app.engine.handlers import HANDLERS
    from app.engine.scheduler import _utcnow

    def _boom(ctx):  # hard failure → step failed (run fails under fail_run)
        raise RuntimeError(f"boom: {ctx.node_id}")

    def _failsoft(ctx):  # definitive failure that still persists partial output
        raise StepFailed("soft fail", {"partial": True, "node": ctx.node_id})

    def _flaky(ctx):  # fails on attempt 1, succeeds on attempt >= 2 (retry test)
        if (ctx.attempt or 1) < 2:
            raise RuntimeError("flaky boom")
        return Output({"ok": True, "attempt": ctx.attempt})

    def _gate(ctx):
        # First execution suspends; resumes (via signal or timer) → succeeds.
        GATE_CALLS[ctx.step_id] = GATE_CALLS.get(ctx.step_id, 0) + 1
        if GATE_CALLS[ctx.step_id] == 1:
            cfg = ctx.config or {}
            fire_at = None
            if cfg.get("timer_seconds") is not None:
                fire_at = _utcnow() + timedelta(seconds=float(cfg["timer_seconds"]))
            return Suspend(event_type=cfg.get("event_type", "resume"),
                           match_key=str(ctx.run_id), fire_at=fire_at)
        return Output({"resumed": True, "calls": GATE_CALLS[ctx.step_id]})

    HANDLERS.setdefault("boom", _boom)
    HANDLERS.setdefault("failsoft", _failsoft)
    HANDLERS.setdefault("flaky", _flaky)
    HANDLERS.setdefault("gate", _gate)


_register_test_handlers()


# Tables we wipe between tests (everything execution-related + their inputs).
_TRUNCATE = (
    "run_events", "step_deps", "run_steps",
    "workflow_run_steps", "workflow_run_documents",
    "mail_messages", "workflow_runs", "cases", "documents",
)


@pytest.fixture(scope="session", autouse=True)
def _schema():
    """Pristine schema for the whole test session."""
    _import_all_models()
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
    Base.metadata.create_all(engine)
    yield
    Base.metadata.drop_all(engine)


@pytest.fixture(scope="session")
def tenant_id(_schema) -> int:
    """A single tenant reused across the session (never truncated)."""
    from app.models.auth import Tenant
    with SessionLocal() as db:
        t = Tenant(name="Test Tenant", slug="test", is_active=True)
        db.add(t)
        db.commit()
        return t.id


@pytest.fixture(autouse=True)
def _clean(_schema):
    """Truncate execution tables before each test."""
    with engine.begin() as conn:
        conn.execute(text(
            "TRUNCATE " + ", ".join(_TRUNCATE) + " RESTART IDENTITY CASCADE"
        ))
    GATE_CALLS.clear()  # step ids recur (RESTART IDENTITY) → reset gate counters
    yield


@pytest.fixture
def db():
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()


@pytest.fixture
def documents():
    """Two fake documents (no real files — echo/unit tests don't read them)."""
    return [
        {"id": 1, "file_path": "/tmp/a.pdf", "mime_type": "application/pdf", "filename": "a.pdf"},
        {"id": 2, "file_path": "/tmp/b.pdf", "mime_type": "application/pdf", "filename": "b.pdf"},
    ]


@pytest.fixture
def run_factory(tenant_id):
    """Create a pending WorkflowRun; returns its id."""
    from app.models.run import WorkflowRun

    def _make(*, fail_policy: str = "fail_run", name: str = "test run",
              sender_email: str | None = None, policy_id: int | None = None) -> int:
        with SessionLocal() as db:
            run = WorkflowRun(tenant_id=tenant_id, status="pending",
                              fail_policy=fail_policy, name=name,
                              sender_email=sender_email, policy_id=policy_id)
            db.add(run)
            db.commit()
            return run.id

    return _make


@pytest.fixture
def start(tenant_id, run_factory, documents):
    """Create a run and materialize a definition; returns (run_id, ready_ids)."""
    from app.engine import scheduler

    def _start(definition: dict, *, docs=None, fail_policy: str = "fail_run",
               context_overrides: dict | None = None,
               sender_email: str | None = None, policy_id: int | None = None) -> tuple[int, list[int]]:
        run_id = run_factory(fail_policy=fail_policy, sender_email=sender_email, policy_id=policy_id)
        with SessionLocal() as db:
            ready = scheduler.start_run(
                db, tenant_id=tenant_id, run_id=run_id, definition=definition,
                documents=documents if docs is None else docs,
                context_overrides=context_overrides,
            )
        return run_id, ready

    return _start


@pytest.fixture
def openrouter_key(tenant_id):
    """Set a tenant OpenRouter key so validate/ai handlers don't bail."""
    from app.models.setting import AppSetting
    with SessionLocal() as db:
        db.merge(AppSetting(tenant_id=tenant_id, key="openrouter_api_key", value="test-key"))
        db.commit()
    return "test-key"


@pytest.fixture
def mock_openrouter(monkeypatch):
    """Patch the OpenAI client in the validate/ai handlers with a fake whose
    chat.completions.create returns canned JSON. Set state["payload"] (dict or
    str) in the test to control the AI response."""
    import json as _json

    state = {"payload": {"results": []}}

    class _Usage:
        prompt_tokens = 10
        completion_tokens = 20

    class _Msg:
        def __init__(self, c): self.content = c

    class _Choice:
        def __init__(self, c): self.message = _Msg(c)

    class _Resp:
        def __init__(self, c): self.choices = [_Choice(c)]; self.usage = _Usage()

    class _Completions:
        def create(self, **kw):
            p = state["payload"]
            return _Resp(p if isinstance(p, str) else _json.dumps(p))

    class _Chat:
        completions = _Completions()

    class FakeOpenAI:
        def __init__(self, *a, **k): self.chat = _Chat()

    import importlib
    # import_module returns the real module from sys.modules — `app.engine.handlers
    # .validate_documents` as an attribute is shadowed by the same-named function
    # that handlers/__init__ imports.
    _vd = importlib.import_module("app.engine.handlers.validate_documents")
    _ai = importlib.import_module("app.engine.handlers.ai")
    monkeypatch.setattr(_vd, "OpenAI", FakeOpenAI)
    monkeypatch.setattr(_ai, "OpenAI", FakeOpenAI)
    return state


@pytest.fixture
def policy_factory(tenant_id):
    """Create a Policy + rules. rules: list of (name, requirement, scope)."""
    from app.models.policy import Policy, PolicyRule

    def _make(rules, *, name="Test Policy", brief="test brief",
              reply_mode="always", email_address=None):
        with SessionLocal() as db:
            p = Policy(tenant_id=tenant_id, name=name, brief=brief, current_version_num=1,
                       email_reply_mode=reply_mode, email_address=email_address)
            db.add(p)
            db.flush()
            for i, (rname, req, scope) in enumerate(rules):
                db.add(PolicyRule(policy_id=p.id, position=i, name=rname,
                                  requirement=req, scope=scope))
            db.commit()
            return p.id

    return _make


@pytest.fixture
def drive_run():
    """Synchronously drive a run to quiescence using the real scheduler:
    loop claim→execute→advance until no `ready` steps remain. Exercises the same
    code paths the Celery tasks do, but deterministically and in-process."""
    from app.engine import scheduler
    from app.models.run_step import RunStep

    def _ready_ids(run_id: int) -> list[int]:
        with SessionLocal() as db:
            return [r.id for r in db.query(RunStep).filter(
                RunStep.run_id == run_id, RunStep.status == "ready"
            ).order_by(RunStep.id).all()]

    def _drive(run_id: int, *, max_steps: int = 500) -> int:
        queue = _ready_ids(run_id)
        processed = 0
        while queue and processed < max_steps:
            sid = queue.pop(0)
            rid = scheduler.process_step(sid, worker_id="test") or run_id
            processed += 1
            # Re-enqueue a retried step (fail_step set it back to ready).
            with SessionLocal() as db:
                st = db.get(RunStep, sid)
                if st and st.status == "ready" and sid not in queue:
                    queue.append(sid)
            for nid in scheduler.advance_run_tx(rid):
                if nid not in queue:
                    queue.append(nid)
        return processed

    return _drive
