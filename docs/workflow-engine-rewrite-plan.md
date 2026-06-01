# Workflow Execution Engine — Complete Rewrite

## Progress log (implementation)

- **Phase 0 ✓** — Postgres everywhere (compose `postgres` service, `psycopg`, Postgres-only `database.py`); fixed the `0001–0009` chain for Postgres (integer→boolean literals + `lastrowid`→`RETURNING id` in `0002/0003/0009`); `Storage`/`LocalStorage` (`engine/storage.py`); migration `0010` + models (`run_steps`, `step_deps`, `run_events`, `workflow_runs` additive cols); full scheduler core (`engine/{context,scheduler,tasks,entry}.py`, `handlers/{echo,condition}`). **26 tests green on Postgres.**
- **Phase 1 ✓** — `engine/events.py` (`signal_event`), `engine/reconciler.py` (expired-lease reclaim, due-timer firing, stranded-ready re-derive), `engine.sweep`/`engine.signal_event` tasks + Celery `beat_schedule` + a `beat` compose service. **38 tests green.**
- **Phase 2 ✓** — all 8 node handlers ported to the handler interface (`engine/handlers/`): input, pdf_to_images, validate_documents, show_results, output, email_input, ai, send_email; single-doc dual paths deleted (everything is `ctx.documents()`). `validate_documents` reuses the exact `_build_prompt`/`_merge_per_doc_results` from the legacy module (byte-identical output contract — Phase 3 moves them into the engine). Email replies + send_email are idempotency-guarded via `MailMessage.external_id = idempotency_key`. **53 tests green** (validate golden contract, canonical pipeline e2e completes with a verdict even with no `show_results`, reply gating + idempotency).
- **Phase 3 ✓ (live)** — all 4 call sites cut over to `engine.start_run` (`routers/{runs,validate,mail,cases}.py`); `cancel_run` → `engine.cancel_run` (D4 cancelled, allows `waiting`); `WorkflowRun.steps` repointed to `RunStep` (viewonly); `RunOut` adds `result` + `RunStepOut` adds `attempt`; `document_ids` derived from the run seed; a shared `cases.validation_output(run)` (prefers `run.result`, falls back to the validate step) decouples `cases`/`review`/`metrics` from the step table. **Stack recreated on Postgres + an echo fan-out ran end-to-end through the real Celery worker → completed.** Deferred: deleting `executor.py`/old node modules (the validate handler still imports `_build_prompt`/`_merge` from there) — final cleanup once those move into the engine.
  - *Deviation:* old `workflow_run_steps`/`workflow_run_documents` tables kept (dead, not dropped) — no migration `0011` yet; the steps relationship simply points elsewhere.
- **Phase 4 ✓** — SSE redesign (`routers/sse.py`): no ~5-min cap (parked `waiting` runs keep streaming), emit-on-change, `result` + per-step `attempt` in the payload, `cancelled` terminal. Frontend: new `StepStatus`/`RunStatus` unions + `result`/`attempt`/`sourceHandle` on the types; every status switch updated (`RunStatusPanel`, `Dashboard`, `Validate`, `CaseDetailPage`, `RunHistory`, `NodeConfigPanel`, `ValidateDocumentsNode`, `ReportView.getValidationOutput` prefers `run.result`); `status.{ready,succeeded,skipped,waiting,cancelled}` i18n; `useRun` polls while `waiting`; Dashboard done-detection → `run.status ∈ (completed,failed,cancelled)`. Frontend builds clean; app verified loading + login + Cases render with zero console errors.

**Deviations from the plan (all toward the plan's own goals):**
1. `0010` is **additive only** — the legacy `workflow_run_steps`/`workflow_run_documents` tables are dropped in a Phase-3 migration *after* the router cutover, so the old engine stays runnable through every phase (the plan's "app stays runnable" rule).
2. The **whole scheduler core** (Output/Branch/Suspend commit, skip propagation, retry, completion) landed in Phase 0; only the reconciler/beat/timer-firing/`signal_event` were deferred to Phase 1.
3. The `condition` handler (structured predicate, no eval) was written in Phase 0 to test Branch/skip; Phase 5 only adds its frontend piece.

---

## Context

The current engine (`api/app/tasks/executor.py`) flattens every workflow into a **linear Celery `chain`**. That design cannot express conditional branching, parallel fan-out, fan-in/join, loops, or human-in-the-loop pauses; it threads data only as "previous node's return → next node's input" (one input per node); and a run only reaches `completed` if an `output`/`show_results` node happens to call `mark_run_done` (so a workflow without a terminal node never completes). It also runs on SQLite (single-writer) with files on local disk — neither scales horizontally.

This is a **complete rewrite** of the execution layer into a **durable, database-as-source-of-truth graph scheduler** with stateless interchangeable workers — flexible enough to express any DAG (branch/join/loop/suspend) and scalable by design. The correctness bar is high: the engine ships **with a real test suite** (the repo currently has none).

**No backward compatibility.** We replace the engine, the run/step model, the SSE stream, and the frontend run UI. We **keep** everything else: auth/tenancy, policies + versions, library/document-types, reference lists, documents, cases, mail/Resend webhooks, workflow *definitions* + versions, the Phase-6 `review` data, per-tenant settings.

### Decisions locked (from the user)
- **D1 — Postgres everywhere** (dev, test, prod). SQLite is dropped. This lets the scheduler use a single Postgres-only code path (`SELECT … FOR UPDATE SKIP LOCKED`, advisory locks) with no dialect fallback. I own the DB/infra migration.
- **D2 — Storage abstraction now, local backend; S3/MinIO deferred.** Code becomes storage-agnostic so S3 is a later config flip; no new infra now.
- **D3 — Wipe the DB, fresh start.** No data preservation, no `run.result` backfill, no legacy step rows. ⚠️ This also resets production data on nas (`interpret.genitechs.ca`).
- **D4 — Distinct `cancelled` status** (today cancel masquerades as `failed`).
- **D5 — Default fail policy = `fail_run`** (run fails as soon as a required step fails; matches today). Per-branch isolation is a later opt-in.
- **D6 — Add a Celery `beat`/sweeper** service for the reconciler + timers.

---

## Target Architecture

1. **DB is the source of truth for execution state.** Each step is a row with an explicit status; the graph's edges and per-step dependency counters live in the DB. Workers are stateless and interchangeable — any worker can run any ready step.
2. **Keep Celery + Redis, invert the model.** Instead of per-node-type tasks chained together, two generic tasks drive everything: `execute_step(step_id)` and `advance_run(run_id)`. The queue is only a *wakeup hint*; the DB is truth, and a periodic **reconciler** re-derives work so a dropped message never strands a run.
3. **Race-free claiming & joins** via Postgres `FOR UPDATE SKIP LOCKED` (claims) and a per-run `pg_advisory_xact_lock(run_id)` that serializes `advance_run` for a single run without blocking other runs.
4. **Clean node handler interface.** A handler is a plain function `(StepContext) -> Output | Suspend | Branch` (no Celery, no status bookkeeping). Inputs are multi-parent (`{upstream_node_id: output}`), breaking the single-input coupling.
5. **Flexibility targets:** sequential, fan-out, fan-in/join, conditional skip + reachability, loops via dynamic step expansion, and human-in-the-loop via `Suspend`/resume (parks a run for days, then resumes on an event or timer).
6. **Run completion is computed by the scheduler** (no runnable/ready/running/waiting steps remain) — fixes the no-terminal-node bug.
7. **Scale-ready, not scale-gold-plated:** stateless workers + Postgres + storage abstraction + a place for per-tenant LLM concurrency caps. Explicitly deferred: S3 wiring, multi-region, exactly-once perfection.

### New package: `api/app/engine/`
```
engine/
  __init__.py
  entry.py        # start_run(...) — the single entry point all 4 call sites use
  scheduler.py    # claim_ready_step, advance, skip propagation, completion detection
  tasks.py        # celery tasks: execute_step, advance_run, sweep
  context.py      # StepContext + Output/Suspend/Branch result types
  storage.py      # Storage interface + LocalStorage backend (S3 later)
  events.py       # signal_event(...) for suspend/resume wakeups
  reconciler.py   # the sweeper (expired leases, due timers, stranded steps)
  handlers/       # one module per node type (the new handler registry HANDLERS)
```

---

## Data Model (Postgres, fresh — no backfill since DB is wiped)

One forward Alembic migration **`0010_execution_engine_v2.py`** (`down_revision="0009_cases"`). Because the DB is wiped, `0001–0009` run fresh on Postgres (no baseline-stamp dance), and `0010` simply:
- **drops** `workflow_run_steps` and `workflow_run_documents`,
- **alters** `workflow_runs` (additive columns below),
- **creates** `run_steps`, `step_deps`, `run_events`.

**`workflow_runs`** — additive only (status set becomes `pending|running|waiting|completed|failed|cancelled`):
| column | type | purpose |
|---|---|---|
| `definition_snapshot` | JSON | exact `{nodes,edges}` the run executes (scheduler's source of truth; a workflow can be edited mid-run) |
| `result` | JSON nullable | canonical run output (e.g. the validation verdict); lets `cases.py` read a verdict without scanning steps |
| `fail_policy` | String(16) default `'fail_run'` | D5 |

**`run_steps`** (replaces `workflow_run_steps`):
- `id` BigInt PK, `run_id` FK→workflow_runs (idx), `tenant_id` (idx, denormalized for sweeps)
- `node_id` Str(128), `node_type` Str(64) *(frontend renders by this — keep it)*
- `status` Str(32): `pending → ready → running → succeeded|failed|skipped|waiting|cancelled`
- `attempt` Int, `max_attempts` Int, `deps_remaining` Int *(live-unsatisfied parent count = join counter)*
- `inputs` JSON `{upstream_node_id: output}` *(roots seeded with `{"_run": {...}}`)*, `output_data` JSON, `config` JSON *(node.data)*
- `error` Text, `logs` JSON, `idempotency_key` Str(128) idx = `f"{run_id}:{node_id}:{attempt}"`
- `lease_owner` Str(64), `lease_expires_at` DateTime *(stuck-step detection)*
- `parent_step_id` BigInt FK→run_steps, `iteration_index` Int *(loop/map expansion)*
- timestamps: `created_at, ready_at, started_at, completed_at`
- `UNIQUE(run_id, node_id, attempt, iteration_index)`; indexes `(run_id, status)`, `(status, lease_expires_at)`

**`step_deps`** (materialized edges = the join graph):
- `id`, `run_id` (idx), `from_step_id` FK (idx), `to_step_id` FK (idx)
- `source_handle` Str(64) nullable *(which output port — for condition branches)*
- `satisfied` Bool default false *(parent reached terminal)*, `live` Bool default true *(false when a condition prunes it)*
- `UNIQUE(from_step_id, to_step_id, source_handle)`; indexes on `to_step_id`, `from_step_id`

**`run_events`** (suspend/timer/wakeup — powers human-in-the-loop & `completeness_gate`):
- `id`, `run_id` (idx), `step_id` FK (idx), `tenant_id` (idx)
- `event_type` Str(64) (`timer|document_added|manual_resume|…`), `match_key` Str(255) idx (e.g. `case_id`)
- `fire_at` DateTime idx (timers), `status` Str(32) `armed|fired|consumed|cancelled`, `payload` JSON
- timestamps; indexes `(status, fire_at)` and `(event_type, match_key, status)`

Register the three new models in `alembic/env.py` and in `celery_app.py`'s model-import block (worker FK graph).

---

## Scheduler Design (key algorithms)

**`start_run(db, *, tenant_id, run_id, definition, documents, context_overrides=None)`** — replaces `trigger_run`:
1. `validate_graph` (non-empty, all node types in `HANDLERS`, no cycle via Kahn, skip dangling edges) → `_fail_run` on violation.
2. Persist `definition_snapshot`; create one `run_steps` row per node (`pending`); materialize edges into `step_deps`; set each step's `deps_remaining = count(live & unsatisfied incoming)`.
3. Seed roots' `inputs` with `{"_run": {"documents": serialize(documents), "tenant_id": ..., **context_overrides}}`.
4. Commit, then flip roots (`deps_remaining==0`) to `ready` and enqueue `execute_step`; also enqueue one `advance_run`.

**`claim_ready_step(db, step_id, worker_id)`** — Postgres-only atomic claim:
- `SELECT … WHERE id=:id AND status='ready' FOR UPDATE SKIP LOCKED`, then CAS `UPDATE … SET status='running', lease_owner, lease_expires_at=now()+LEASE_TTL WHERE id=:id AND status='ready'`. Loser of a duplicate delivery gets 0 rows → no-op. Many workers claim distinct ready steps with zero contention (true fan-out).

**`execute_step(step_id)`** Celery task (`acks_late=True`):
- claim → if `None`, return; if run `cancelled`, mark step cancelled; set run `running` on first step.
- **Run the handler OUTSIDE any DB transaction** (handlers do 120s LLM calls — never hold a lock).
- Commit terminal/suspended state: `Output`→`succeeded`+output; `Branch`→`succeeded`+prune `step_deps` whose `source_handle ∉ live_handles`; `Suspend`→`waiting`+insert armed `run_events`. On exception → `handle_step_failure` (retry `failed→ready` while `attempt+1<max_attempts`, else `failed`). Then enqueue `advance_run`.

**`advance_run(run_id)`** — the core scheduler, serialized per run via `pg_advisory_xact_lock(run_id)`:
1. For each newly-terminal step, mark its outgoing `step_deps.satisfied=true` (idempotent guard) and decrement successors' `deps_remaining`; merge the parent's output into the successor's `inputs[parent_node_id]`.
2. `propagate_skips` to a fixpoint: any `pending` step with no live reachable parent → `skipped` (a `condition`-pruned branch transitively skips; a join survives as long as ≥1 live path remains).
3. Flip satisfied `pending` steps (`deps_remaining==0` with ≥1 live satisfied parent, or root) → `ready`.
4. **Completion:** count `active = pending|ready|running`, `waiting`. If `active==0 and waiting==0` → `failed` (if any required step failed under `fail_run`) else compute `run.result` and `completed`. If `active==0 and waiting>0` → run `waiting` (non-terminal). Commit, **then** enqueue `execute_step` for newly-ready steps (commit-before-enqueue so workers see `ready`). Publish a Redis `run:{id}` message for SSE.

**Suspend/resume:** `engine.signal_event(event_type, match_key, payload)` finds armed `run_events`, marks the step `ready`, re-enqueues. `mail.py`/`cases.py` call it when a new document attaches to a case. Due timers (`fire_at<=now`) are fired by the reconciler.

**Reconciler (`reconciler.py`, run by `beat` every ~10s):** requeue expired `running` leases; re-derive stranded `ready`; fire due timers; fail steps past a hard deadline. This is the safety net that guarantees no run is ever stuck.

**Idempotency:** side-effecting handlers (`send_email`, the email reply, `output` file copy) check/record `idempotency_key` before acting, so `acks_late` redelivery / retries never double-fire.

### Concurrency hazards → mitigations
| Hazard | Mitigation |
|---|---|
| Two parents finish → double-ready a join | serialized `advance_run` (advisory lock) + `deps_remaining` counter + `ready` CAS in claim |
| Duplicate Celery delivery | `status='ready'` CAS; loser no-ops |
| Worker dies mid-step | `acks_late` + lease; reconciler requeues expired `running` |
| Lost wakeup message | reconciler re-derives ready work from DB |
| Side effect twice on retry | `idempotency_key` (includes `attempt`) |
| Long LLM call holding a lock | handler runs outside any transaction |
| Enqueue before state visible | always commit before enqueue |
| Cancelled run keeps working | run-status check at claim + handler `ctx.check_cancelled()` checkpoints |
| Skip strands a join in `pending` | `propagate_skips` fixpoint + completion counts only active+waiting |

---

## Node Handler Interface + Porting the 8 Nodes

`engine/context.py`:
```python
@dataclass
class StepContext:
    step_id; run_id; tenant_id; node_type; config; inputs   # inputs: {upstream_node_id: output}
    storage: Storage; log: Callable[[str], None]; idempotency_key: str
    def check_cancelled(self) -> None        # raises CancelledError if run cancelled
    def primary_input(self) -> dict          # deterministic shallow-merge of upstream outputs
    def documents(self) -> list[dict]        # the run's document set (from _run or upstream)
    def setting(self, key) -> str | None     # tenant-scoped AppSetting (openrouter key/model)

@dataclass class Output:  data: dict
@dataclass class Suspend: event_type: str; match_key: str|None=None; fire_at: datetime|None=None
@dataclass class Branch:  data: dict; live_handles: list[str]
HANDLERS: dict[str, Handler]   # replaces NODE_REGISTRY
```
Handlers never touch run/step status; all bookkeeping lives in the executor. **Standardize on one `documents` model** and delete every single-doc dual path.

1. **`input`** — emits `{"documents": ctx.documents()}` (anchors the doc set).
2. **`pdf_to_images`** — keep the multi-doc branch verbatim; delete single-doc fallback; write images via `ctx.storage` (storage-relative paths).
3. **`validate_documents`** — keep the multi-doc branch; **preserve the output shape byte-for-byte** (`overall, results[], per_document, scope, policy_*`) — it's a hard contract for `cases.py`, `ReportView.tsx`, `ValidationResultsModal.tsx`, `review`. `document_id` becomes optional. `fail_on_missing` → raise `StepFailed(output=...)` after recording output (so output still persists). Reuse the existing prompt-building + merge logic unchanged.
4. **`show_results`** — split: (a) returns `Output(merged)` → executor copies to `run.result` (run completes via scheduler, not `mark_run_done`); (b) the **email reply** (`_send_reply`) moves here, made idempotent via `ctx.idempotency_key`; keep reply-mode gating, `{{failed_rules}}` templating, tokenized reply-to via `cases.get_case_email_token`.
5. **`output`** — `Output({"manifest": …})`; file copy through `ctx.storage`, idempotency-guarded.
6. **`email_input`** — reads inbound `MailMessage` for the run; emits selected fields + `{"documents": ctx.documents()}`.
7. **`ai`** — `render_template(system_prompt, ctx.primary_input())`, images from `ctx.documents()`, OpenRouter via `ctx.setting`. Reuse `template.py` unchanged.
8. **`send_email`** — `render_template` for to/subject/body; record outbound `MailMessage` idempotency-guarded.

Multi-input templating: `ctx.primary_input()` shallow-merges upstream outputs (deterministic by node_id); raw available as `{{inputs.<node_id>.<field>}}`.

---

## New Node Types (prove the flexibility end-to-end)

- **`condition`** — config is a structured predicate `{field, op, value}` (no `eval`). Returns `Branch(data, live_handles=["true"|"false"])`; executor prunes the other edge; `propagate_skips` removes the dead sub-branch. Requires edges to carry `sourceHandle`. Proves **conditional skip + reachability**.
- **`completeness_gate`** — config `{required_doc_types, timeout_days}`. Checks the case's docs (`cases.current_document_ids`); if complete → `Output`; else → `Suspend(event_type="document_added", match_key=case_id, fire_at=now+timeout)`. Resumes when a new doc arrives (`signal_event`) or on the timer. Proves **suspend/resume across days + external + timer wakeups**.
- **Demo workflow** (the showcase): `input → pdf_to_images → validate_documents → condition(overall==fail) → {true: completeness_gate → send_email("please resubmit"); false: show_results}` both joining a final `output`. Exercises fan-out, skip, join, and suspend in one run.

---

## Infra Changes (Postgres everywhere + storage abstraction)

- **`pyproject.toml`**: add `psycopg[binary]`; add `[project.optional-dependencies] test = [pytest, pytest-asyncio, pytest-mock, freezegun]`. No other runtime deps.
- **`docker-compose.yml`**: add a `postgres:16` service (named volume for data); set `DATABASE_URL=postgresql+psycopg://…` on `api`, `worker`, and the new `beat` service; add a **`beat`** service (`celery -A app.tasks.celery_app.celery_app beat` + the reconciler schedule) — or run beat embedded on the worker. `api`/`worker` `depends_on: postgres healthy`.
- **`deploy/docker-compose.prod.yml`** + nas: add Postgres there too (the live SQLite data is wiped per D3). Update `.env`/overlay `DATABASE_URL`. The autodeploy cron rebuilds and runs `alembic upgrade head` against the new Postgres.
- **`api/app/config.py`**: default `database_url` → Postgres; keep `storage_path`.
- **`api/app/database.py`**: drop the SQLite `check_same_thread` branch (Postgres-only); standard pool.
- **`engine/storage.py`**: `Storage` interface (`save`, `open`, `url_for`, `copy`) with `LocalStorage` wrapping current `STORAGE_PATH` logic. `files.py` and the nodes go through it. S3 backend is a later drop-in behind a config flag.

---

## SSE + API + Frontend Change List

- **Definition format**: `FlowEdge` (frontend `types/workflow.ts`) gains optional `sourceHandle?`/`targetHandle?`. `WorkflowEditor.tsx` `onConnect` already carries `sourceHandle` from React Flow — stop discarding it on save. Add `condition` + `completeness_gate` node components to `NODE_TYPES` + `NodePalette` ITEMS.
- **New status set** — frontend unions:
  ```ts
  StepStatus = 'pending'|'ready'|'running'|'succeeded'|'failed'|'skipped'|'waiting'|'cancelled'
  RunStatus  = 'pending'|'running'|'waiting'|'completed'|'failed'|'cancelled'
  ```
  Update every status switch (icon + color + i18n): `components/RunStatusPanel.tsx`, `pages/Dashboard.tsx`, `pages/Validate.tsx`, `pages/CaseDetailPage.tsx`, `pages/CasesPage.tsx`, `pages/RunHistory.tsx`, `components/NodeConfigPanel.tsx`, `components/nodes/ValidateDocumentsNode.tsx`; add `status.{ready,succeeded,skipped,waiting,cancelled}` + node labels for the two new nodes to `lib/i18n/strings/common.ts`.
  - **Critical**: `Dashboard.tsx` currently treats `show_results`-step completion as "done" — switch to `run.status in (completed,failed,cancelled)`; `waiting` is NOT done.
  - `api/runs.ts` `useRun` `refetchInterval`: poll while `pending|running|waiting`.
- **SSE (`routers/sse.py`)**: remove the 300-iteration (~5 min) cap (parked `waiting` runs must stream); subscribe to Redis `run:{id}` pub/sub with a ~3–5s DB-poll fallback; emit `done` only on `completed|failed|cancelled`; add `run.result` + per-step `attempt` to the payload.
- **Schemas (`schemas/run.py`)**: `RunOut` adds `result: dict|None`; `document_ids` re-sourced from `case_documents`/`definition_snapshot` (the join table is dropped). `RunStepOut` adds `attempt: int`; `input_data` maps to the new `inputs`.
- **Four call sites → `engine.start_run`**: `routers/runs.py`, `routers/validate.py`, `routers/mail.py` (both inbound paths), `routers/cases.py`. Keep `_canonical_definition`. `cancel_run` sets `status='cancelled'`, cancels armed events, calls `engine.cancel_run`. Rewrite `cases.py:_last_result` to read `run.result`. Delete `executor.py`, old `registry.py`, and the old `nodes/*` Celery tasks once Phase 3 is green.

---

## Test Plan (the critical deliverable — zero tests today)

Tests run against a **disposable Postgres** (matches deployment; SKIP-LOCKED/advisory-lock behavior is real). Layout under `api/tests/`:
- **`conftest.py`** — fixtures: `pg_db` (fresh schema per test/module), `tenant`, fake `documents`, `mock_openrouter` (monkeypatch `OpenAI(...).chat.completions.create` → canned JSON), `run_factory`, and a **`drive_run(run_id)` harness** that loops claim→execute→advance until no ready steps remain (exercises the real scheduler synchronously, lets tests assert intermediate state).
- **unit/**: `test_graph` (topo/cycle/unknown/dangling), `test_claim` (incl. `test_concurrent_claims` — N threads, each step claimed exactly once), `test_advance_join` (incl. `test_two_parents_finish_concurrently` — join readies exactly once), `test_skip` (prune + fixpoint; join survives partial skip), `test_completion` (**completes with NO terminal node**; fail-vs-complete), `test_idempotency` (double `execute_step` → one side effect), `test_cancel` (cancelled≠failed; armed events cancelled), `test_suspend` (Suspend→waiting; `signal_event`→ready; timer fires via reconciler), `test_retry`, `test_reconciler` (expired lease requeued; due timer fires).
- **handlers/**: `test_validate` (**golden output-shape contract** — overall/results/per_document/precedence/not_applicable→fail-on-required), `test_ai`, `test_show_results` (run.result + reply gating + idempotent reply), `test_send_email`, `test_condition`, `test_completeness_gate`.
- **e2e/**: `test_echo_pipeline` (linear + fan-out+join + conditional skip), `test_canonical_validate` (input→pdf→validate→show_results, mocked AI, full run, completes), `test_suspend_resume_e2e` (gate parks → doc added → resumes → completes).
- **Run in Docker**: `docker compose run --rm api pytest -q` against a `postgres` test service. **Minimum "absolutely sure" set** = the unit core + `test_validate` + `test_canonical_validate` + `test_suspend_resume_e2e` (~11 files, ~40–50 cases).

---

## Phased Rollout (each phase independently testable; app stays runnable)

> **Verification gates every phase — non-negotiable.** A phase is not "done" until: **(a)** its automated tests are green on Postgres, and **(b)** for any user-facing change, the affected Docker services are rebuilt (`docker compose build … && docker compose up -d --no-deps --force-recreate …`, per the project's rebuild rule) and the behavior is confirmed in the running app. No phase advances on unverified work; the `Gate:` line on each phase below is that phase's verification checklist.

- **Phase 0 — Foundation & de-risk.** Postgres everywhere (compose `postgres` service, `psycopg`, config/database changes); **verify the full `0001–0009` Alembic chain applies cleanly on fresh Postgres and fix any SQLite-only DDL / `lastrowid` usage** (notably the `0009` backfill). Add `Storage` interface + `LocalStorage`. Write migration `0010`. Build `engine/` skeleton (`start_run`, `claim_ready_step`, `execute_step`, `advance_run`, completion) + one trivial `echo` handler. **Gate:** `test_graph/claim/advance_join/completion/idempotency/cancel/echo_pipeline` green on Postgres.
- **Phase 1 — Reconciler + suspend/timers.** `beat` service + `reconciler.py`; `Suspend`/`Branch` handling, `run_events`, `signal_event`. **Gate:** parked runs resume via event and timer (`test_reconciler/suspend/retry/skip`).
- **Phase 2 — Port the 8 real nodes** onto the handler interface (reuse `template.py` + validate logic verbatim). **Gate:** `validate_documents` output byte-identical to the old contract (`test_validate` + handler tests).
- **Phase 3 — Cut over the 4 call sites + decouple cases.** Re-point routers to `engine.start_run`; rewrite `cases.py:_last_result` to read `run.result`; delete `executor.py`/old nodes. **Gate:** an API validate run completes and yields a verdict with no `show_results` required (`test_canonical_validate` + a mail-inbound e2e).
- **Phase 4 — SSE + frontend.** SSE redesign (no cap, pub/sub + fallback, terminal statuses); frontend status set, `condition`/`completeness_gate` node components, Dashboard done-detection fix. **Gate:** UI streams a parked `waiting` run and shows it resume.
- **Phase 5 — Flexibility showcase.** Ship `condition` + `completeness_gate` + the demo workflow; optional `Expand` (loop/map). **Gate:** the demo workflow runs end-to-end with skip+join+suspend (`test_suspend_resume_e2e`).
- **Phase 6 (deferred) — Scale hardening.** S3/MinIO backend; per-tenant/per-model LLM concurrency caps. NOT building: multi-region, exactly-once perfection.

---

## Top Risks & Mitigations
1. **Alembic chain on Postgres** — `0001–0009` were authored for SQLite (`render_as_batch`, possible `lastrowid` reliance in `0009`). *Mitigation:* Phase 0 verifies/fixes the whole chain on a fresh Postgres before anything is built on it.
2. **`validate_documents` output contract drift** breaks `cases.py`/`ReportView`/`review`. *Mitigation:* golden-output test pins the schema; port merge logic unchanged.
3. **Idempotency gaps** → double-sent real email on retry. *Mitigation:* `idempotency_key`-guarded `MailMessage`; redelivery e2e test.
4. **SSE pub/sub miss** strands a parked run in the UI. *Mitigation:* keep the slow DB-poll fallback; pub/sub is an optimization.
5. **Production data wipe (nas)** per D3 — make sure nothing irreplaceable lives only there before the cut-over.

---

## Verification

Verification happens at **two levels**: a per-phase **Gate** (above — each phase's tests must be green and, for UI-facing changes, the rebuilt app confirmed before moving on) and the **final end-to-end acceptance** below. Both are required for the rewrite to be considered complete; the work is **not done until the final acceptance passes**.

### Final end-to-end acceptance
1. **Build & migrate:** `docker compose build api worker beat frontend && docker compose up -d` (stack now includes `postgres` + `beat`); confirm `alembic upgrade head` reaches `0010` on Postgres and the API health check is green.
2. **Automated suite:** `docker compose run --rm api pytest -q` → full suite green on Postgres; the "absolutely sure" minimum set (unit core + `test_validate` + `test_canonical_validate` + `test_suspend_resume_e2e`) **must** pass. This is the gate that proves the engine works.
3. **Rebuild & confirm in the running app** (per the project rule — no change is "done" until the running app reflects it): rebuild `frontend` + `api`/`worker`, then exercise the UI directly.
4. **Validate flow (happy path):** create a policy, run the **Validate** flow on a multi-doc set → run reaches `completed`, verdict + per-rule evidence render unchanged, and SSE streams live step status through the new states.
5. **Branch + suspend (the flexibility proof):** run the **demo workflow** → the unused branch shows `skipped`, the join waits for both inputs, and a `completeness_gate` parks the run as `waiting`, then **resumes** (UI keeps streaming) when a document is added or the timer fires.
6. **Mail e2e:** inbound email → run fires via `engine.start_run`, reply sent **exactly once** (idempotency verified), case timeline shows the verdict from `run.result`.
7. **Resilience spot-checks:** kill the worker mid-run and confirm the reconciler requeues the leased step and the run still completes; cancel a running run and confirm it reaches `cancelled` (not `failed`) and no further steps execute.

## Critical Files
- `api/app/tasks/executor.py` — engine being replaced (its `trigger_run` defines the entry contract the 4 call sites use).
- `api/app/models/run.py` — `WorkflowRun` (extended) + `WorkflowRunStep` (replaced by `run_steps`); new model modules live alongside.
- `api/app/tasks/nodes/validate_documents.py` — most complex handler to port; output shape is a hard cross-system contract.
- `api/app/routers/{runs,validate,mail,cases}.py` — the four `trigger_run` call sites → `engine.start_run`.
- `api/app/routers/sse.py` — SSE generator to redesign (remove cap, pub/sub, new statuses).
- `api/alembic/versions/` + `alembic/env.py` — `0010` migration; verify `0001–0009` on Postgres.
- `frontend/src/types/workflow.ts` — status/edge type contract that fans out to every status switch + the React Flow editor.
- `docker-compose.yml` + `deploy/docker-compose.prod.yml` — add Postgres + beat.
