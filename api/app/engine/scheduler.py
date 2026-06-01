"""The graph scheduler — the heart of execution-engine-v2.

DB is the source of truth. Pure-ish functions operate on a passed-in `Session`
so they can be driven synchronously by tests (the `drive_run` harness) and by the
Celery tasks alike. No function here enqueues Celery work; callers do that with
the step-id lists these functions return (commit-before-enqueue).

Concurrency model (Postgres-only):
  * claim_ready_step  — SELECT … FOR UPDATE SKIP LOCKED + a status='ready' CAS.
  * advance_run       — serialized per run via pg_advisory_xact_lock(run_id).
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import text

from app.database import SessionLocal
from app.engine.context import (
    Branch,
    CancelledError,
    Output,
    StepContext,
    StepFailed,
    Suspend,
)
from app.engine.handlers import HANDLERS
from app.engine.storage import get_storage
from app.models.run import WorkflowRun
from app.models.run_step import RunEvent, RunStep, StepDep

LEASE_TTL = timedelta(seconds=600)  # must exceed the slowest handler (LLM calls)

TERMINAL = ("succeeded", "failed", "skipped", "cancelled")
ACTIVE = ("pending", "ready", "running")


def _utcnow() -> datetime:
    # Naive UTC to match the timestamp-without-tz columns.
    return datetime.now(UTC).replace(tzinfo=None)


# ── graph validation ────────────────────────────────────────────────────────

class GraphError(Exception):
    pass


def validate_graph(definition: dict) -> tuple[list[dict], list[dict]]:
    """Return (topologically-sorted nodes, edges) or raise GraphError.

    Mirrors the old executor's guards: non-empty, all node types known, no cycle,
    dangling edges skipped.
    """
    nodes = (definition or {}).get("nodes") or []
    edges = (definition or {}).get("edges") or []
    if not nodes:
        raise GraphError("Workflow has no nodes — nothing to run. Add at least one node and save.")

    id_to_node = {n["id"]: n for n in nodes}
    unknown = sorted({n.get("type") for n in nodes if n.get("type") not in HANDLERS})
    if unknown:
        raise GraphError(f"Unknown node type(s): {', '.join(str(u) for u in unknown)}")

    in_deg = {n["id"]: 0 for n in nodes}
    adj: dict[str, list[str]] = {n["id"]: [] for n in nodes}
    for e in edges:
        src, tgt = e.get("source"), e.get("target")
        if src not in id_to_node or tgt not in id_to_node:
            continue  # dangling edge — skip (would otherwise strand the run)
        adj[src].append(tgt)
        in_deg[tgt] += 1

    queue = [nid for nid, d in in_deg.items() if d == 0]
    ordered: list[dict] = []
    while queue:
        nid = queue.pop(0)
        ordered.append(id_to_node[nid])
        for nb in adj[nid]:
            in_deg[nb] -= 1
            if in_deg[nb] == 0:
                queue.append(nb)
    if len(ordered) < len(nodes):
        raise GraphError("Workflow graph contains a cycle — execution order can't be determined.")
    return ordered, edges


def _serialize_documents(documents) -> list[dict]:
    out: list[dict] = []
    for d in documents or []:
        if isinstance(d, dict):
            entry = {
                "id": d.get("id"),
                "file_path": d.get("file_path"),
                "mime_type": d.get("mime_type") or "",
                "filename": d.get("filename") or d.get("original_filename") or "",
            }
            # Preserve pre-extracted content if the caller supplied it (a
            # pre-processed set, or a pipeline with no pdf_to_images step).
            if d.get("text_content") is not None:
                entry["text_content"] = d["text_content"]
            if d.get("image_paths"):
                entry["image_paths"] = d["image_paths"]
            out.append(entry)
        else:
            out.append({
                "id": d.id,
                "file_path": d.file_path,
                "mime_type": d.mime_type or "",
                "filename": d.original_filename,
            })
    return out


def _fail_run(db, run_id: int, error: str) -> None:
    run = db.get(WorkflowRun, run_id)
    if run and run.status in ("pending", "running", "waiting"):
        run.status = "failed"
        run.error = error
        run.completed_at = _utcnow()
        db.commit()


# ── start_run ────────────────────────────────────────────────────────────────

def start_run(db, *, tenant_id: int, run_id: int, definition: dict,
              documents, context_overrides: dict | None = None) -> list[int]:
    """Materialize the run graph and return the step ids that are immediately
    `ready` (roots). Commits. On a graph violation the run is failed → returns []."""
    try:
        nodes, edges = validate_graph(definition)
    except GraphError as exc:
        _fail_run(db, run_id, str(exc))
        return []

    run = db.get(WorkflowRun, run_id)
    if run is None:
        return []
    run.definition_snapshot = definition

    seed = {"_run": {
        "documents": _serialize_documents(documents),
        "tenant_id": tenant_id,
        **(context_overrides or {}),
    }}

    node_to_step: dict[str, RunStep] = {}
    for node in nodes:
        cfg = node.get("data") or {}
        try:
            max_attempts = max(1, int(cfg.get("max_attempts", 1)))
        except (TypeError, ValueError):
            max_attempts = 1
        step = RunStep(
            run_id=run_id,
            tenant_id=tenant_id,
            node_id=node["id"],
            node_type=node["type"],
            status="pending",
            attempt=1,
            max_attempts=max_attempts,
            deps_remaining=0,
            inputs=dict(seed),
            config=cfg,
            idempotency_key=f"{run_id}:{node['id']}:1",
            iteration_index=0,
        )
        db.add(step)
        node_to_step[node["id"]] = step
    db.flush()  # assign step ids

    # Materialize edges → step_deps; dedup on (from, to, handle).
    seen: set[tuple[int, int, str]] = set()
    for e in edges:
        src, tgt = e.get("source"), e.get("target")
        if src not in node_to_step or tgt not in node_to_step:
            continue
        handle = e.get("sourceHandle") or ""
        from_id, to_id = node_to_step[src].id, node_to_step[tgt].id
        key = (from_id, to_id, handle)
        if key in seen:
            continue
        seen.add(key)
        db.add(StepDep(run_id=run_id, from_step_id=from_id, to_step_id=to_id,
                       source_handle=handle, live=True, satisfied=False))
        node_to_step[tgt].deps_remaining += 1

    ready: list[int] = []
    for node in nodes:
        step = node_to_step[node["id"]]
        if step.deps_remaining == 0:
            step.status = "ready"
            step.ready_at = _utcnow()
            ready.append(step.id)

    run.status = "running" if ready else "pending"
    db.commit()
    return ready


# ── claim ─────────────────────────────────────────────────────────────────────

def claim_ready_step(db, step_id: int, worker_id: str) -> RunStep | None:
    """Atomically claim a `ready` step for execution. Returns the claimed step or
    None if it was already claimed / no longer ready (duplicate delivery loses)."""
    row = db.execute(
        text("SELECT id FROM run_steps WHERE id = :id AND status = 'ready' "
             "FOR UPDATE SKIP LOCKED"),
        {"id": step_id},
    ).first()
    if row is None:
        db.rollback()
        return None
    db.execute(
        text("UPDATE run_steps SET status = 'running', lease_owner = :w, "
             "lease_expires_at = :exp, started_at = COALESCE(started_at, :now) "
             "WHERE id = :id AND status = 'ready'"),
        {"w": worker_id, "exp": _utcnow() + LEASE_TTL, "now": _utcnow(), "id": step_id},
    )
    db.commit()
    return db.get(RunStep, step_id)


# ── context construction + handler-facing side channels ───────────────────────

def _append_log(step_id: int, msg: str) -> None:
    try:
        ts = _utcnow().strftime("%H:%M:%S.%f")[:-3]
        line = f"[{ts}] {msg}"
        with SessionLocal() as db:
            step = db.get(RunStep, step_id)
            if step:
                step.logs = list(step.logs or []) + [line]
                db.commit()
    except Exception:
        pass  # never crash a handler on a log failure


def _is_cancelled(run_id: int) -> bool:
    with SessionLocal() as db:
        run = db.get(WorkflowRun, run_id)
        return bool(run and run.status == "cancelled")


def build_context(step: RunStep, run: WorkflowRun) -> StepContext:
    step_id = step.id
    run_id = run.id
    return StepContext(
        step_id=step_id,
        run_id=run_id,
        tenant_id=run.tenant_id,
        node_id=step.node_id,
        node_type=step.node_type,
        config=dict(step.config or {}),
        inputs=dict(step.inputs or {}),
        attempt=step.attempt or 1,
        idempotency_key=step.idempotency_key or f"{run_id}:{step.node_id}:{step.attempt or 1}",
        storage=get_storage(),
        log=lambda m, _sid=step_id: _append_log(_sid, m),
        _cancelled_check=lambda _rid=run_id: _is_cancelled(_rid),
    )


# ── committing handler results ────────────────────────────────────────────────

def commit_step_output(db, step_id: int, output: dict) -> None:
    """Persist a partial output without changing status (StepFailed path)."""
    step = db.get(RunStep, step_id)
    if step is not None:
        step.output_data = output or {}


def commit_step_result(db, step_id: int, result) -> None:
    step = db.get(RunStep, step_id)
    if step is None:
        return
    now = _utcnow()

    if isinstance(result, Suspend):
        step.status = "waiting"
        db.add(RunEvent(
            run_id=step.run_id,
            step_id=step.id,
            tenant_id=step.tenant_id,
            event_type=result.event_type,
            match_key=(str(result.match_key) if result.match_key is not None else None),
            fire_at=result.fire_at,
            status="armed",
            payload=result.payload or {},
        ))
        return

    if isinstance(result, Branch):
        step.status = "succeeded"
        step.output_data = result.data or {}
        step.completed_at = now
        live = set(result.live_handles or [])
        for dep in db.query(StepDep).filter(StepDep.from_step_id == step.id).all():
            if dep.source_handle not in live:
                # Prune: dead edge no longer counts as a live dependency.
                if dep.live and not dep.satisfied:
                    succ = db.get(RunStep, dep.to_step_id)
                    if succ:
                        succ.deps_remaining = max(0, (succ.deps_remaining or 0) - 1)
                dep.live = False
        return

    # Output, a bare dict, or None.
    if isinstance(result, Output):
        data = result.data or {}
    elif isinstance(result, dict):
        data = result
    else:
        data = {}
    step.status = "succeeded"
    step.output_data = data
    step.completed_at = now


def fail_step(db, step_id: int, error: str, definitive: bool = False) -> bool:
    """Mark a step failed, or retry it (status→ready, attempt+1) when attempts
    remain. Returns True if it was retried (caller must re-enqueue execute_step)."""
    step = db.get(RunStep, step_id)
    if step is None:
        return False
    if not definitive and (step.attempt or 1) < (step.max_attempts or 1):
        step.attempt = (step.attempt or 1) + 1
        step.status = "ready"
        step.ready_at = _utcnow()
        step.lease_owner = None
        step.lease_expires_at = None
        step.idempotency_key = f"{step.run_id}:{step.node_id}:{step.attempt}"
        step.error = error[:4000] if error else error
        return True
    step.status = "failed"
    step.error = error[:4000] if error else error
    step.completed_at = _utcnow()
    return False


# ── execute one step (claim → handler → commit) ───────────────────────────────

def process_step(step_id: int, worker_id: str = "worker") -> int | None:
    """Full single-step execution: claim, run the handler OUTSIDE any transaction,
    then commit the terminal/suspended state. Returns the run_id (so the caller can
    advance the run) or None if the step wasn't claimable."""
    # 1. Claim + set-up (transaction A).
    with SessionLocal() as db:
        step = claim_ready_step(db, step_id, worker_id)
        if step is None:
            return None
        run = db.get(WorkflowRun, step.run_id)
        if run is None:
            return None
        run_id = run.id
        if run.status == "cancelled":
            step.status = "cancelled"
            step.completed_at = _utcnow()
            db.commit()
            return run_id
        if run.status in ("pending", "waiting"):
            run.status = "running"
            run.started_at = run.started_at or _utcnow()
            db.commit()
        ctx = build_context(step, run)

    handler = HANDLERS.get(ctx.node_type)
    if handler is None:
        with SessionLocal() as db:
            fail_step(db, step_id, f"No handler for node type '{ctx.node_type}'", definitive=True)
            db.commit()
        return ctx.run_id

    # 2. Run handler outside any DB transaction.
    try:
        result = handler(ctx)
    except CancelledError:
        with SessionLocal() as db:
            s = db.get(RunStep, step_id)
            if s and s.status not in TERMINAL:
                s.status = "cancelled"
                s.completed_at = _utcnow()
            db.commit()
        return ctx.run_id
    except StepFailed as sf:
        with SessionLocal() as db:
            commit_step_output(db, step_id, sf.output)
            fail_step(db, step_id, str(sf) or "step failed", definitive=True)
            db.commit()
        return ctx.run_id
    except Exception as exc:  # noqa: BLE001 — any handler error is a step failure
        with SessionLocal() as db:
            fail_step(db, step_id, f"{type(exc).__name__}: {exc}")
            db.commit()
        return ctx.run_id

    # 3. Commit terminal/suspended state (transaction B).
    with SessionLocal() as db:
        commit_step_result(db, step_id, result)
        db.commit()
    return ctx.run_id


# ── advance the run (the scheduler step) ──────────────────────────────────────

def advance_run(db, run_id: int) -> list[int]:
    """Re-derive run state after one or more steps reached a terminal status.
    Serialized per run via an advisory lock. Returns step ids newly made `ready`
    (the caller commits, then enqueues execute_step for them).

    Steps + deps are loaded ONCE and mutated purely in memory. SessionLocal uses
    autoflush=False, so re-querying mid-fixpoint would re-read stale (unflushed)
    rows and double-process an edge — corrupting the join counter."""
    db.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": int(run_id)})
    run = db.get(WorkflowRun, run_id)
    if run is None or run.status in ("completed", "failed", "cancelled"):
        return []

    steps = db.query(RunStep).filter(RunStep.run_id == run_id).all()
    by_id = {s.id: s for s in steps}
    deps = db.query(StepDep).filter(StepDep.run_id == run_id).all()
    incoming: dict[int, list[StepDep]] = {}
    for d in deps:
        incoming.setdefault(d.to_step_id, []).append(d)

    def parent_succeeded(dep: StepDep) -> bool:
        par = by_id.get(dep.from_step_id)
        return par is not None and par.status == "succeeded"

    # Fixpoint: satisfy deps from terminal parents, then propagate skips.
    guard = len(steps) + len(deps) + 5
    changed = True
    while changed and guard >= 0:
        changed = False
        guard -= 1

        # 1. Satisfy each unsatisfied dep whose parent reached a terminal status.
        for dep in deps:
            if dep.satisfied:
                continue
            parent = by_id.get(dep.from_step_id)
            if parent is None or parent.status not in TERMINAL:
                continue
            dep.satisfied = True
            changed = True
            if dep.live:
                succ = by_id.get(dep.to_step_id)
                if succ is not None:
                    succ.deps_remaining = max(0, (succ.deps_remaining or 0) - 1)
                    if parent.status == "succeeded":
                        merged = dict(succ.inputs or {})
                        merged[parent.node_id] = parent.output_data or {}
                        succ.inputs = merged

        # 2. Propagate skips: a pending non-root step that can never receive a
        #    live, delivered input becomes skipped (transitively).
        for p in steps:
            if p.status != "pending":
                continue
            inc = incoming.get(p.id, [])
            if not inc:
                continue  # root — never skip
            live_in = [d for d in inc if d.live]
            if not live_in:
                p.status, p.completed_at, changed = "skipped", _utcnow(), True
                continue
            unsatisfied_live = [d for d in live_in if not d.satisfied]
            delivered = any(d.satisfied and parent_succeeded(d) for d in live_in)
            if not unsatisfied_live and not delivered:
                p.status, p.completed_at, changed = "skipped", _utcnow(), True

    # 3. Ready eligible pending steps.
    newly_ready: list[int] = []
    for p in steps:
        if p.status != "pending" or (p.deps_remaining or 0) > 0:
            continue
        inc = incoming.get(p.id, [])
        is_root = len(inc) == 0
        delivered = any(d.live and d.satisfied and parent_succeeded(d) for d in inc)
        if is_root or delivered:
            p.status = "ready"
            p.ready_at = _utcnow()
            newly_ready.append(p.id)

    # 4. Completion.
    active = sum(1 for s in steps if s.status in ACTIVE)
    waiting = sum(1 for s in steps if s.status == "waiting")
    failed = [s for s in steps if s.status == "failed"]
    if active == 0:
        if waiting > 0:
            run.status = "waiting"
        elif failed and (run.fail_policy or "fail_run") == "fail_run":
            run.status = "failed"
            run.error = ("; ".join(s.error for s in failed if s.error))[:2000] or "A required step failed."
            run.completed_at = _utcnow()
        else:
            run.status = "completed"
            run.result = _pick_result(steps, deps)
            run.completed_at = _utcnow()
    elif run.status in ("pending", "waiting"):
        run.status = "running"

    return newly_ready


def advance_run_tx(run_id: int) -> list[int]:
    """advance_run wrapped in its own transaction (advisory lock auto-released)."""
    with SessionLocal() as db:
        ids = advance_run(db, run_id)
        db.commit()
    return ids


def _pick_result(steps: list[RunStep], deps: list[StepDep]) -> dict | None:
    """Canonical run output: prefer a leaf (no live outgoing edge) carrying a
    verdict (`overall`), else the latest leaf, else any verdict-bearing output."""
    succeeded = [s for s in steps if s.status == "succeeded"]
    if not succeeded:
        return None

    has_live_out = {d.from_step_id for d in deps if d.live}

    def has_verdict(s: RunStep) -> bool:
        return isinstance(s.output_data, dict) and "overall" in s.output_data

    def ts(s: RunStep):
        return s.completed_at or datetime.min

    leaves = [s for s in succeeded if s.id not in has_live_out]
    for s in sorted(leaves, key=ts, reverse=True):
        if has_verdict(s):
            return s.output_data
    if leaves:
        return max(leaves, key=ts).output_data
    for s in sorted(succeeded, key=ts, reverse=True):
        if has_verdict(s):
            return s.output_data
    return None


# ── cancellation ──────────────────────────────────────────────────────────────

def cancel_run(db, run_id: int) -> None:
    """Mark a run cancelled (D4 — distinct from failed): stop pending/ready/
    running steps, cancel armed events. Running handlers notice via check_cancelled
    or are abandoned (their commit is a no-op once the run is cancelled)."""
    run = db.get(WorkflowRun, run_id)
    if run is None or run.status in ("completed", "failed", "cancelled"):
        return
    run.status = "cancelled"
    run.completed_at = _utcnow()
    for step in db.query(RunStep).filter(
        RunStep.run_id == run_id, RunStep.status.in_(ACTIVE + ("waiting",))
    ).all():
        step.status = "cancelled"
        step.completed_at = _utcnow()
    for ev in db.query(RunEvent).filter(
        RunEvent.run_id == run_id, RunEvent.status == "armed"
    ).all():
        ev.status = "cancelled"
    db.commit()
