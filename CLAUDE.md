# Clerq2 — Project Reference

> **INSTRUCTION FOR CLAUDE:** After completing any task — no matter how small — update this file to reflect what changed. New files, deleted files, changed conventions, new endpoints, new node types, new environment variables, new gotchas, design decisions. Do this before marking the task done. This file is the single source of truth for the project; keeping it current is part of every task.

> **IMPLEMENTATION PLAN:** Active multi-phase work is tracked in [`docs/implementation-plan.md`](docs/implementation-plan.md). Read it before starting any new phase to understand what was approved, what's in scope, and the non-negotiable generalization principle.

Clerq2 is a document management platform. The core feature is a visual workflow editor (like n8n) where users design multi-step document processing pipelines, upload files, and run them via a background queue. The MVP workflow is: **Input → PDF to Images → Validate Documents → Output**.

The validation system has three parts: a **Document Library** (reusable document type definitions with AI instructions and sample images), **Policies** (named validation rule sets with a natural-language brief + optional structured rule cards with accept/fail criteria), and a **`validate_documents` workflow node** that calls OpenRouter vision models to check documents against a policy. Policies are versioned — every save (PUT /policies/{id}), rule add, rule delete, or reorder creates a new `PolicyVersion` snapshot. The version used in each run is recorded in the step's `output_data`.

The **Dashboard** is the end-user interface for running favorited workflows without entering the editor. Workflows can be starred (`is_favorite=true`) from the Workflows list page. Each favorited workflow appears as an interactive widget on the Dashboard — drop a PDF, click Run, and watch live step progress stream in. If the workflow has a `show_results` terminal node, a results sidebar slides in from the right when the run completes, rendering images, validation results, or raw JSON.

The **Mail section** (`/mail`) provides a fake local email inbox for end-to-end flow testing. Each policy and workflow can have email receiving enabled (toggle in PolicyEditor / WorkflowList), which assigns a dedicated address like `policy-3@clerq.local` or `workflow-7@clerq.local`. The `/mail` page has a compose panel (From, To dropdown of active mailboxes, Subject, Body, file attachment) — clicking Send uploads the file and calls `POST /api/mail/inbound`, which triggers the appropriate run. When the run completes, a reply `MailMessage` is written automatically by `show_results.py` and appears in the inbox panel (polling every 5s). No real SMTP — everything stays inside the app.

The **Validate section** (`/validate`) is the policy-centric run launcher. It is the primary path for the common case — pick a policy, drop one or more documents, run, see results — without ever touching the workflow editor. Under the hood it fires the same canonical pipeline (input → pdf_to_images → validate_documents → show_results) and creates standard `WorkflowRun` records, but all of that is invisible to the user. The workflow editor remains available for advanced/custom pipelines. See the **Validate Section** design doc below.

The drop zone accepts multiple files. After dropping, the user sees a list of pending files — each row shows its filename with a remove button; an "Add more" button lets them append files without clearing the set. The Run button shows the file count when more than one is queued (`Run (N)`). Submitting uploads files sequentially, collects their document IDs, and fires a single run via `document_ids`. The run list shows a "N docs" badge for multi-document runs. Opening a completed multi-doc run's report and selecting a rule with per-document results shows a **Per document** section — each document's filename, status badge, individual evidence, and confidence — below the merged evidence text.

---

## Running the App

```bash
cp .env.example .env          # first time only
docker compose up -d          # start all services
docker compose logs -f        # tail all logs
docker compose logs -f worker # tail just the worker
```

To rebuild after code changes to `api/` or `frontend/`:

```bash
docker compose build api worker frontend
docker compose up -d --force-recreate
```

The API source (`api/app/`) is mounted as a volume — uvicorn auto-reloads Python changes without a rebuild. Frontend changes require a rebuild.

**URLs:**
- App: http://localhost (nginx on port 80)
- API: http://localhost:8000 (also proxied through nginx at `/api`)
- Health check: http://localhost:8000/api/health

---

## Architecture

```
┌─────────────────────────────────────────┐
│  Browser                                │
│  localhost (nginx :80)                  │
│    /           → React SPA              │
│    /api/*      → proxy to api:8000      │
└─────────────────────────────────────────┘
              │
┌─────────────▼────────────┐   ┌─────────────────────┐
│  api (FastAPI :8000)     │   │  worker (Celery)     │
│  uvicorn w/ auto-reload  │──▶│  concurrency=2       │
│  SQLite + SQLAlchemy 2.0 │   │  same image as api   │
└──────────────────────────┘   └──────────┬───────────┘
              │                            │
              └──────────┬─────────────────┘
                         │
                ┌────────▼────────┐
                │  Redis :6379    │
                │  broker+backend │
                └─────────────────┘

Shared volume: ./data → /app/data
  /app/data/clerq.db          SQLite database
  /app/data/storage/          uploaded files + run output
```

Four Docker services, all defined in `docker-compose.yml`:

| Service | Image | Port | Role |
|---|---|---|---|
| `redis` | redis:7-alpine | internal only | Celery broker + result backend |
| `api` | clerq2-api | 8000 | FastAPI — REST + SSE |
| `worker` | clerq2-api (same) | none | Celery worker, CMD overridden |
| `frontend` | clerq2-frontend | 80 | nginx serving Vite build + proxy |

**Critical:** Redis has no host port mapping intentionally — a local Redis on the host was conflicting with port 6379. Containers talk to each other via the `redis` hostname on the internal Docker network.

---

## Directory Structure

```
clerq2/
├── CLAUDE.md                 ← you are here
├── docker-compose.yml
├── .env                      ← actual secrets (not committed)
├── .env.example              ← template
├── data/
│   ├── clerq.db              ← SQLite database (auto-created on startup)
│   └── storage/              ← uploaded PDFs + rendered PNGs
│       └── run_{id}_doc_{id}_pages/
│           └── page_NNNN.png
│
├── api/
│   ├── Dockerfile            ← python:3.11-slim, installs via uv
│   ├── pyproject.toml        ← dependencies (FastAPI, Celery, pymupdf, python-docx, openpyxl, etc.)
│   └── app/
│       ├── main.py           ← FastAPI app, CORS, router registration, startup
│       ├── config.py         ← Pydantic Settings (DATABASE_URL, REDIS_URL, STORAGE_PATH)
│       ├── database.py       ← SessionLocal, Base, get_db, create_tables()
│       │
│       ├── models/
│       │   ├── workflow.py         ← Workflow (id, name, definition, is_archived, is_favorite, current_version_num)
│       │   ├── workflow_version.py ← WorkflowVersion (id, workflow_id, version_num, definition)
│       │   ├── document.py         ← Document (filename, original_filename, file_path, mime_type, size_bytes)
│       │   └── run.py              ← WorkflowRun + WorkflowRunStep + WorkflowRunDocument (join table for multi-doc sets)
│       │
│       ├── schemas/
│       │   ├── workflow.py   ← Pydantic request/response models for workflows
│       │   ├── document.py   ← DocumentOut schema
│       │   └── run.py        ← RunOut, RunStepOut, TriggerRunIn schemas
│       │
│       ├── routers/
│       │   ├── workflows.py  ← CRUD + archive/unarchive + favorite/unfavorite + GET versions + POST restore + enable/disable-inbox
│       │   ├── documents.py  ← POST /api/documents/upload, GET /api/documents/
│       │   ├── runs.py       ← POST /api/runs (records version_id+version_num), GET list/detail
│       │   ├── sse.py        ← GET /api/runs/{id}/stream — SSE real-time updates
│       │   ├── files.py      ← GET /api/files/{path:path} — serve storage files (path traversal protected)
│       │   ├── library.py    ← CRUD /api/library/ + sample upload/delete
│       │   ├── policies.py   ← CRUD /api/policies/ + rule CRUD + reorder + version history + restore + enable/disable-inbox
│       │   └── mail.py       ← GET /mailboxes, POST /inbound (triggers run), GET /messages
│       │
│       ├── models/  (additions)
│       │   ├── document_type.py  ← DocumentType + DocumentTypeSample
│       │   ├── policy.py         ← Policy (+ current_version_num, email_inbox_enabled, email_address) + PolicyRule + PolicyVersion
│       │   └── mail.py           ← MailMessage (id, run_id, document_id, direction, from_addr, to_addr, subject, body, created_at)
│       │
│       ├── schemas/  (additions)
│       │   ├── library.py    ← DocumentTypeOut, DocumentTypeSampleOut, DocumentTypeCreate/Update
│       │   ├── policy.py     ← PolicyOut (+ email_inbox_enabled, email_address), PolicyRuleOut, PolicyCreate/Update, PolicyRuleCreate/Update, PolicyVersionOut
│       │   └── mail.py       ← MailboxOut, MailInboundRequest, MailMessageOut
│       │
│       └── tasks/
│           ├── celery_app.py  ← Celery instance + config; MUST import all ORM models here
│           ├── registry.py    ← NODE_REGISTRY: dict mapping node_type str → task function
│           ├── executor.py    ← topological sort (Kahn's) + Celery chain builder; trigger_run(run_id, definition, docs: list[Document])
│           └── nodes/
│               ├── base.py                ← mark_step_running/done/failed, mark_run_running/done/failed, step_log
│               ├── ingest.py              ← "input" node task; emits step_log lines
│               ├── pdf_to_images.py       ← "pdf_to_images" node task; uses pymupdf (fitz); emits step_log lines
│               ├── validate_documents.py  ← "validate_documents" node; calls OpenRouter vision API; accepts PDF/image direct input; emits step_log lines
│               ├── output.py              ← "output" node task; optionally copies files to output_folder; emits step_log lines
│               └── show_results.py        ← "show_results" node task; passthrough — logs, marks done, returns input_data unchanged
│
└── frontend/
    ├── Dockerfile            ← multi-stage: node build → nginx serve
    ├── nginx.conf            ← proxy /api to api:8000; client_max_body_size 100M; proxy_buffering off for SSE
    ├── vite.config.ts        ← dev server proxy /api → localhost:8000
    ├── tailwind.config.ts
    └── src/
        ├── main.tsx          ← React root
        ├── App.tsx           ← Routes + wraps everything in ThemeProvider + QueryClientProvider
        ├── index.css         ← Tailwind base + CSS theme variables (:root light / .dark) + React Flow overrides
        │
        ├── context/
        │   └── theme.tsx     ← ThemeProvider, useTheme() — mode: light|dark|system; persists to localStorage; applies .dark class on <html>
        │
        ├── types/
        │   └── workflow.ts   ← All shared TS types (Workflow, Run, RunStep, SSERunUpdate, etc.)
        │
        ├── api/
        │   ├── client.ts     ← axios instance (baseURL: /api)
        │   ├── workflows.ts  ← useWorkflows, useWorkflow, useCreateWorkflow, useUpdateWorkflow, useArchiveWorkflow, useUnarchiveWorkflow, useFavoriteWorkflow, useUnfavoriteWorkflow, useWorkflowVersions, useRestoreVersion, useEnableWorkflowInbox, useDisableWorkflowInbox
        │   ├── runs.ts       ← useRuns, useRun, useTriggerRun, useCancelRun, useUploadDocument, useDocuments
        │   ├── validate.ts   ← useValidateRuns(policyId?), useTriggerValidateRun
        │   └── mail.ts       ← useMailboxes, useMailMessages (5s poll), useSendMail
        │
        ├── pages/
        │   ├── Dashboard.tsx       ← Widget grid for favorited workflows (at /); per-widget file drop + SSE streaming + results sidebar
        │   ├── Validate.tsx        ← Policy list + run launcher (/validate); sidebar nav label = "Policies"; left panel = policy picker with inline create; right panel = live run queue with per-rule status
        │   ├── MailInbox.tsx       ← Fake email compose + inbox (/mail); left = compose panel (From/To/Subject/Body/Attach/Send); right = message list with inbound+outbound rows
        │   ├── WorkflowList.tsx    ← Workflow list: create/archive/star; routed at /workflows
        │   ├── WorkflowEditor.tsx  ← Main page: React Flow canvas + NodeConfigPanel/NodePalette + VersionsModal
        │   ├── RunHistory.tsx      ← Run log for a workflow; shows version badge (v3) per run
        │   └── Settings.tsx        ← Appearance (light/dark/system theme picker) + OpenRouter API key/model
        │   NOTE: PoliciesList.tsx is retired — policy list lives inside Validate.tsx
        │
        └── components/
            ├── LeftSidebar.tsx       ← Nav sidebar (220px, Linear-style); Dashboard first, then Workflows
            ├── NodePalette.tsx       ← Right sidebar when no node selected; draggable node list
            ├── NodeConfigPanel.tsx   ← Right sidebar when a node is selected; node-specific config fields
            ├── RunStatusPanel.tsx    ← Fixed bottom bar (global, persists across navigation): live step status via SSE + REST fallback, Stop button, dismiss (X) button; rendered in App.tsx via GlobalRunStatus + RunContext
            ├── RunOutputViewer.tsx   ← Full-screen image grid modal with lightbox
            ├── VersionsModal.tsx     ← Version history modal; shows all versions with node count + restore button
            └── nodes/
                ├── InputNode.tsx          ← "input" node component (source handle bottom, indigo)
                ├── PdfToImagesNode.tsx    ← "pdf_to_images" node (target top, source bottom, amber; shows scale)
                ├── OutputNode.tsx         ← "output" node (target handle top, emerald; shows output_folder)
                └── ShowResultsNode.tsx    ← "show_results" node (target handle top, violet; terminal node for dashboard display)
```

---

## Database Schema

Tables are created automatically on API startup via `create_tables()` then `run_migrations()` in `database.py`. New tables are created by `create_all()`; new columns on existing tables are added via safe `ALTER TABLE ADD COLUMN` with try/except (SQLite-compatible). Never drop data; use archive flags instead.

**Phase 1A (multi-doc support):** Added `workflow_run_documents` join table. `trigger_run` now accepts `docs: list[Document]`. The `input`, `pdf_to_images`, and `validate_documents` nodes all handle a `documents: [...]` list in their input/output data. Validation results include a `per_document` array on each rule entry when multiple documents are evaluated.

**Phase 2 (Word/Excel/CSV ingestion):** `pdf_to_images` detects `.docx`, `.xlsx`, `.xls`, `.csv` by extension and extracts text instead of rendering pages. Each doc entry in the output now carries either `image_paths` (PDF/image) or `text_content` (str, capped at 50 K chars). `validate_documents` passes text docs as `{"type": "text", ...}` content blocks alongside `image_url` blocks — the AI sees both. Mixed sets (PDF + Word + CSV in one run) work end-to-end. New dependencies: `python-docx`, `openpyxl`. The Validate screen file input now accepts `.docx,.xlsx,.xls,.csv` in addition to PDF and images.

```sql
workflows (
  id                  INTEGER PRIMARY KEY,
  name                TEXT NOT NULL,
  description         TEXT,
  definition          JSON NOT NULL,   -- cached copy of latest version's definition (for fast list queries)
  is_archived         BOOLEAN NOT NULL DEFAULT 0,
  is_favorite         BOOLEAN NOT NULL DEFAULT 0,  -- true = show on Dashboard as interactive widget
  current_version_num INTEGER NOT NULL DEFAULT 0,
  created_at          DATETIME,
  updated_at          DATETIME
)

workflow_versions (
  id           INTEGER PRIMARY KEY,
  workflow_id  INTEGER REFERENCES workflows(id),
  version_num  INTEGER NOT NULL,   -- sequential per workflow; 1, 2, 3…
  definition   JSON NOT NULL,      -- {nodes: [...], edges: [...]}
  created_at   DATETIME
)
-- Every PUT /workflows/{id} with a definition creates a new row here.
-- Restore = new version that copies an old version's definition.

documents (
  id                INTEGER PRIMARY KEY,
  filename          TEXT NOT NULL,          -- UUID filename on disk
  original_filename TEXT NOT NULL,          -- original upload name shown in UI
  file_path         TEXT NOT NULL,          -- absolute path inside container
  mime_type         TEXT,
  size_bytes        INTEGER,
  created_at        DATETIME
)

mail_messages (
  id           INTEGER PRIMARY KEY,
  run_id       INTEGER REFERENCES workflow_runs(id),  -- nullable; links reply to the triggering run
  document_id  INTEGER REFERENCES documents(id),      -- nullable
  direction    TEXT NOT NULL,                         -- 'inbound' | 'outbound'
  from_addr    TEXT NOT NULL,
  to_addr      TEXT NOT NULL,
  subject      TEXT,
  body         TEXT,
  created_at   DATETIME
)
-- Created automatically on API startup via create_all(). No manual migration needed.
-- Inbound row: written by POST /api/mail/inbound when a message arrives.
-- Outbound row: written by show_results.py when run.sender_email is set.

workflow_run_documents (
  id           INTEGER PRIMARY KEY,
  run_id       INTEGER REFERENCES workflow_runs(id),
  document_id  INTEGER REFERENCES documents(id),
  position     INTEGER NOT NULL DEFAULT 0   -- order in the set (0 = primary)
)
-- Created by create_all() — no migration needed.
-- Populated by trigger_run() for all runs (single-doc runs get one row).
-- Exposed as run.document_ids in RunOut.

workflow_runs (
  id           INTEGER PRIMARY KEY,
  workflow_id  INTEGER REFERENCES workflows(id),
  document_id  INTEGER REFERENCES documents(id),
  version_id   INTEGER REFERENCES workflow_versions(id),  -- which version was run (nullable for pre-versioning rows)
  version_num  INTEGER,                                   -- denormalized for quick display
  name         TEXT,                                      -- human-readable run name; defaults to uploaded filename; later: extracted field from policy
  status       TEXT NOT NULL,              -- pending | running | completed | failed
  started_at   DATETIME,
  completed_at DATETIME,
  error        TEXT,
  created_at   DATETIME
)
-- name column: populated at run creation time (original_filename of the uploaded document).
-- Future: policy can declare an "extract this field" rule; the validate_documents node will
-- write the extracted value back to this column, replacing the filename with something like
-- "John Smith — Passport" or "Invoice #12345". Policy chaining will produce compound names.

workflow_run_steps (
  id           INTEGER PRIMARY KEY,
  run_id       INTEGER REFERENCES workflow_runs(id),
  node_id      TEXT NOT NULL,              -- matches node.id from React Flow definition
  node_type    TEXT NOT NULL,              -- input | pdf_to_images | output
  status       TEXT NOT NULL,             -- pending | running | completed | failed
  input_data   JSON,
  output_data  JSON,                      -- e.g. {image_paths: ["run_1_doc_1_pages/page_0001.png"]}
  error        TEXT,
  started_at   DATETIME,
  completed_at DATETIME,
  logs         TEXT                       -- JSON array of timestamped log strings written by step_log()
)
```

---

## API Endpoints

```
GET  /api/health                                          → {status: "ok"}

GET  /api/workflows/                                      → Workflow[]   (non-archived by default)
GET  /api/workflows/?include_archived=true                → Workflow[]   (all)
POST /api/workflows/                                      → Workflow     body: {name, definition?}
GET  /api/workflows/{id}                                  → Workflow
PUT  /api/workflows/{id}                                  → Workflow     body: {name?, definition?} — creates a new version
POST /api/workflows/{id}/archive                          → Workflow     (no delete; use archive instead)
POST /api/workflows/{id}/unarchive                        → Workflow
POST /api/workflows/{id}/favorite                         → Workflow     sets is_favorite=True
POST /api/workflows/{id}/unfavorite                       → Workflow     sets is_favorite=False
GET  /api/workflows/{id}/versions                         → WorkflowVersion[]  (newest first)
POST /api/workflows/{id}/versions/{vid}/restore           → Workflow     creates new version copying old definition

POST /api/documents/upload                                → Document     multipart file
GET  /api/documents/                                      → Document[]

POST /api/runs/                                           → Run          body: {workflow_id, document_id}
GET  /api/runs/{id}                                       → Run
GET  /api/runs/?workflow_id={id}                          → Run[]
POST /api/runs/{id}/cancel                                → Run          marks run+pending steps failed; queued Celery tasks bail at next step boundary

GET  /api/runs/{id}/stream                                → SSE stream   events: "update" | "done"
                                                            update data: {run_id, status, error, steps[]}
                                                            polls DB every 1s, max 300 iterations (~5 min)

GET  /api/files/{path:path}                               → FileResponse serves ./data/storage/{path}
                                                            path traversal protected (realpath check)

GET  /api/library/                       → DocumentType[]
POST /api/library/                       → DocumentType     body: {name, description?, ai_instructions?}
GET  /api/library/{id}                   → DocumentType     includes samples
PUT  /api/library/{id}                   → DocumentType
DELETE /api/library/{id}                 → 204
POST /api/library/{id}/samples           → DocumentTypeSample  multipart file
DELETE /api/library/{id}/samples/{sid}   → 204

GET  /api/policies/                                      → Policy[]
POST /api/policies/                                      → Policy           body: {name, description?, brief}
GET  /api/policies/{id}                                  → Policy           includes rules + linked document_type
PUT  /api/policies/{id}                                  → Policy           creates new PolicyVersion snapshot
DELETE /api/policies/{id}                                → 204
GET  /api/policies/{id}/versions                         → PolicyVersion[]  newest first; each has rule_count
POST /api/policies/{id}/versions/{vid}/restore           → Policy           creates new version copying old snapshot
POST /api/policies/{id}/rules                            → PolicyRule       also creates a PolicyVersion snapshot
PUT  /api/policies/{id}/rules/{rule_id}                  → PolicyRule       does NOT create a version (too frequent)
DELETE /api/policies/{id}/rules/{rid}                    → 204              also creates a PolicyVersion snapshot
PATCH /api/policies/{id}/rules/reorder                   → Policy           also creates a PolicyVersion snapshot
POST /api/policies/{id}/enable-inbox                     → Policy           sets email_inbox_enabled=True, email_address=policy-{id}@clerq.local
POST /api/policies/{id}/disable-inbox                    → Policy           sets email_inbox_enabled=False, email_address=None
POST /api/workflows/{id}/enable-inbox                    → Workflow         sets email_inbox_enabled=True, email_address=workflow-{id}@clerq.local
POST /api/workflows/{id}/disable-inbox                   → Workflow         sets email_inbox_enabled=False, email_address=None

GET  /api/mail/mailboxes                                 → Mailbox[]        all enabled policy+workflow mailboxes
POST /api/mail/inbound                                   → Run              body: {to, from_email, subject?, body?, document_id?}
                                                           matches recipient to policy/workflow, triggers run, stores sender_email for reply
GET  /api/mail/messages                                  → MailMessage[]    all inbound+outbound messages, newest first
```

---

## Execution Flow

```
1. User designs workflow in React Flow editor
   → Saves: PUT /api/workflows/{id}  body: {definition: {nodes, edges}}
   → node.data stores user config (e.g. {scale: 2.0, output_folder: "exports"})

2. User uploads a PDF
   → POST /api/documents/upload (multipart)
   → Saved to /app/data/storage/{uuid}.pdf

3. User triggers a run
   → POST /api/runs  body: {workflow_id, document_id}
   → API creates WorkflowRun (status=pending)
   → executor.trigger_run() called:
       a. topological sort of nodes (Kahn's algorithm)
       b. creates WorkflowRunStep rows for each node (status=pending)
       c. builds Celery chain (see below)
       d. chain.delay() → enqueued to Redis

4. Celery worker executes chain
   → Each task receives: (input_data, run_id, step_id, node_config)
   → Task: mark step running → do work → mark step done → return output_data
   → Celery passes return value as first positional arg to next task in chain
   → On failure: mark step failed, mark run failed, chain stops

5. Frontend streams status
   → GET /api/runs/{id}/stream (SSE)
   → RunStatusPanel shows each step: pending → running → completed/failed
   → After pdf_to_images completes, "View images" button appears
   → Images served via GET /api/files/{relative_path}
```

---

## Celery Chain — Critical Detail

This is the trickiest part of the codebase. The chain data-threading is non-obvious:

```python
# executor.py — building the chain
if i == 0:
    # First task: explicitly pass initial_input as first positional arg
    sig = task_fn.s(initial_input, run_id=run_id, step_id=step.id, node_config=node_config)
else:
    # Subsequent tasks: NO first positional arg
    # Celery automatically injects the previous task's return value as input_data
    sig = task_fn.s(run_id=run_id, step_id=step.id, node_config=node_config)
```

```python
# All task functions have this signature:
@celery_app.task(name="nodes.xxx", bind=True)
def some_task(self, input_data: dict, run_id: int, step_id: int, node_config: dict | None = None) -> dict:
    ...
    return output_data  # this becomes input_data for the next task
```

```python
# celery_app.py — MUST import all ORM models here
# Without this, the worker process doesn't know about FK targets and SQLAlchemy crashes
import app.models.workflow  # noqa: F401
import app.models.document  # noqa: F401
import app.models.run       # noqa: F401
```

---

## Node Data Contracts

| Node | input_data | output_data | node_config keys |
|---|---|---|---|
| `input` | `{document_id, file_path, mime_type}` | same | none |
| `email_input` | `{document_id?, file_path?, mime_type?}` | `{subject?, from?, to?, body?, file_path?, mime_type?, document_id?}` | `fields: string[]` (default all 5: subject/from/to/body/attachments) |
| `pdf_to_images` | `{document_id, file_path}` | `{document_id, image_paths: [str], page_count: int, text_content?: str}` | `scale` (float, default 2.0) |
| `ai` | anything from prev step (incl. `image_paths`, `file_path`) | `{...input_data, ai_response: string}` | `system_prompt` (str, required), `model` (str, OpenRouter model ID) |
| `validate_documents` | `{document_id, image_paths: [str], page_count: int}` | `{policy_id, policy_name, policy_version_num, overall: pass/fail/needs_review, results: [...], image_paths, document_id}` | `policy_id` (int, required), `model` (str, OpenRouter model ID), `fail_on_missing` (bool, default true) |
| `output` | previous step's output | `{manifest: {...}, status: "complete"}` | `output_folder` (str) |
| `send_email` | anything from prev step | `{...input_data, sent_to: str, sent_subject: str}` | `to` (str, supports `{{var}}`), `subject` (str), `body` (str) |
| `show_results` | previous step's output | same (passthrough) | none |

**Template syntax** (`{{variable}}`): The `ai` and `send_email` nodes support `{{key}}` in their config fields. Dot notation works for nested values (`{{results.0.rule_name}}`). Missing keys resolve to empty string. Dict/list values are JSON-serialized. Implemented in `api/app/tasks/nodes/template.py` — reusable by any future node.

**email_input** is a source node (no target handle). It reads `MailMessage` for the current run (`direction="inbound"`) and exposes the selected fields. It always passes `file_path`/`document_id` through so downstream nodes (pdf_to_images, ai) can access attachments.

`show_results` is a terminal node (no source handle). Its completed `output_data` is what the Dashboard sidebar renders. The Dashboard auto-detects the data type: `overall` present → validation result view; `image_paths` present → 2-col image grid; otherwise → pretty-printed JSON.

`image_paths` are stored as **relative paths** from `STORAGE_PATH` (e.g. `"run_1_doc_1_pages/page_0001.png"`). The frontend constructs image URLs as `/api/files/{relative_path}`.

---

## React Flow — Important CSS

React Flow applies its own styles to node wrapper divs that create white backgrounds and wrong sizing. These are stripped in `frontend/src/index.css`:

```css
.react-flow__node-input,
.react-flow__node-output,
.react-flow__node-pdf_to_images,
.react-flow__node-validate_documents,
.react-flow__node-default {
  padding: 0 !important;
  border: none !important;
  background: transparent !important;
  /* ... etc */
}
```

**When adding a new node type `foo`, add `.react-flow__node-foo` to this list**, otherwise it gets a white box.

Current node type CSS classes registered: `input`, `output`, `pdf_to_images`, `validate_documents`, `show_results`, `email_input`, `ai`, `send_email`.

---

## Adding a New Node Type

Checklist — do all of these or the new node won't work:

**Backend:**
1. `api/app/tasks/nodes/foo.py` — implement task with correct signature
2. `api/app/tasks/registry.py` — add `"foo": foo_task` to `NODE_REGISTRY`
3. `api/app/tasks/celery_app.py` — add `"app.tasks.nodes.foo"` to `include` list

**Frontend:**
4. `frontend/src/components/nodes/FooNode.tsx` — React component
5. `frontend/src/index.css` — add `.react-flow__node-foo` to the style-reset block
6. `frontend/src/pages/WorkflowEditor.tsx` — add `foo: FooNode` to `NODE_TYPES`
7. `frontend/src/components/NodePalette.tsx` — add entry to `ITEMS`
8. `frontend/src/components/NodeConfigPanel.tsx` — add config fields for `foo`
9. `frontend/src/components/RunHistory.tsx` — add label to `NODE_LABELS`
10. `frontend/src/components/RunStatusPanel.tsx` — add label to `NODE_LABELS`

Then rebuild: `docker compose build api worker frontend && docker compose up -d --force-recreate`

---

## Environment Variables

```
DATABASE_URL=sqlite:////app/data/clerq.db
REDIS_URL=redis://redis:6379/0
STORAGE_PATH=/app/data/storage
SECRET_KEY=change-me-in-production
OPENROUTER_API_KEY=           ← required for validate_documents node
OPENROUTER_DEFAULT_MODEL=google/gemini-2.0-flash-exp
```

For local dev outside Docker (running `uvicorn` directly):
```
DATABASE_URL=sqlite:///./data/clerq.db
REDIS_URL=redis://localhost:6379/0
STORAGE_PATH=./data/storage
```

---

## Routing

| Path | Component | Notes |
|---|---|---|
| `/` | `Dashboard` | Widget grid for favorited workflows |
| `/validate` | `Validate` | Policy-centric run launcher (primary validation UI) |
| `/workflows` | `WorkflowList` | All workflows with star/archive controls |
| `/workflows/:id` | `WorkflowEditor` | React Flow canvas |
| `/workflows/:id/runs` | `RunHistory` | Run log |
| `/library` | `LibraryList` | Document type library |
| `/library/:id` | `LibraryEditor` | Document type detail |
| `/policies` | `PoliciesList` | Policies list |
| `/policies/:id` | `PolicyEditor` | Policy detail |
| `/settings` | `Settings` | Theme + OpenRouter key |
| `/mail` | `MailInbox` | Fake email compose + inbox |

**Important:** WorkflowList used to be at `/`. It is now at `/workflows`. All breadcrumb links have been updated. If you add new links to WorkflowList, use `to="/workflows"`, not `to="/"`.

---

## Dashboard & Favorites

The Dashboard (`/`) shows one card widget per favorited, non-archived workflow. Favorites are stored as `is_favorite=true` on the `workflows` table (added via `run_migrations()`).

**Widget lifecycle:**
1. **Idle** — drop zone shown; last run status shown in footer if any runs exist
2. **File selected** — filename + Run button; uploads happen on Run click (not on drop)
3. **Running** — SSE stream opened; step chips update live
4. **Done** — step chips finalize; if `show_results` node completed, results sidebar slides in

**Results sidebar (400px, pushes grid):**
- Opened automatically when `show_results` step reaches `completed`; also has a "View results" button for manual re-open
- Three render modes auto-detected from `output_data`:
  - `overall` key present → validation summary (big status badge + per-rule list)
  - `image_paths` key present → 2-col image grid with lightbox
  - anything else → `<pre>` JSON dump

**Star icon in WorkflowList:**
- Appears as the first column, before the workflow name
- Filled amber when `is_favorite=true`; outline ghost when false
- Calls `POST /api/workflows/{id}/favorite` or `unfavorite`
- Invalidates the `['workflows']` query key on success

---

## Validate Section

The Validate section (`/validate`) is the primary UI for policy validation. It replaces the workflow-editor ceremony for the 90% case: pick a policy, drop a document, run it, see results.

### Design decisions

**Policy-first, not workflow-first.** The user never sees a workflow. Internally, each run uses a **canonical validation pipeline** — a synthetic workflow definition `{nodes: [input, pdf_to_images, validate_documents, show_results], edges: [...]}` assembled on the fly in the API, never persisted as a `Workflow` row. The run is still a normal `WorkflowRun` with steps, SSE streaming, etc.

**Single-policy now, chain-ready later.** The UI currently lets you select one policy at a time. Future policy chaining will appear here as multi-select with an ordering UI; the API will fan the run out into sequential validate_documents steps sharing the same pdf_to_images output.

**Run names are meaningful.** Every run gets `name = original_filename` at creation. Later, a policy can declare an extraction field; the `validate_documents` node will overwrite `name` on the `WorkflowRun` row with the extracted value (e.g. "John Smith — Passport"). The Validate page always shows `name`, never the raw run ID.

### Page layout

```
┌─────────────────────────────────────────────────────┐
│  Left panel (320px)         │  Right panel (flex)   │
│                             │                       │
│  Policy picker              │  Run queue / history  │
│  ─ searchable list          │  ─ newest run on top  │
│  ─ one selected at a time   │  ─ run name = filename│
│  ─ shows rule count + brief │  ─ live step chips    │
│                             │    while running      │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │  ─ click row to open  │
│                             │    results drawer     │
│  Drop zone                  │                       │
│  ─ accepts PDF + images     │                       │
│  ─ shows filename on drop   │                       │
│                             │                       │
│  [Run]                      │                       │
└─────────────────────────────────────────────────────┘
```

**Results drawer** slides in from the right (same renderer as Dashboard sidebar):
- `overall` present → validation summary (big status badge + per-rule list with evidence)
- `image_paths` present → 2-col image grid with lightbox
- otherwise → pretty-printed JSON

### API endpoints

```
POST /api/validate/run          → WorkflowRun   body: {policy_id, document_id?} OR {policy_id, document_ids: [int, ...]}
                                  Accepts either a single document_id (backward compat) or a document_ids list.
                                  Assembles canonical pipeline, fires run, returns run record.
                                  Sets run.name = filename (single) or "N documents" (multi), source = "validate".

GET  /api/validate/runs         → WorkflowRun[] All runs with source="validate".
                                  Optional: ?policy_id=N to filter by policy.
```

All SSE streaming and result access reuse existing endpoints (`/api/runs/{id}/stream`, `/api/files/{path}`).

### DB changes (implemented)

- `workflow_runs.workflow_id` — made nullable (validate runs have no backing Workflow row)
- `workflow_runs.name TEXT` — filename at creation; later: extracted field from policy
- `workflow_runs.source TEXT` — `"validate"` for Validate-section runs; NULL for workflow editor runs
- `workflow_runs.policy_id INTEGER` — policy used; enables filtering in `GET /api/validate/runs`
- `workflow_runs.sender_email TEXT` — set for `source="mail"` runs; `show_results.py` sends reply `MailMessage` to this address on completion
- `policies.email_inbox_enabled BOOLEAN NOT NULL DEFAULT 0` — whether this policy has a mailbox active
- `policies.email_address TEXT` — assigned address, e.g. `policy-3@clerq.local`; null when disabled
- `workflows.email_inbox_enabled BOOLEAN NOT NULL DEFAULT 0` — same for workflows
- `workflows.email_address TEXT` — e.g. `workflow-7@clerq.local`

### Future: run name extraction

When implemented, the policy will carry an `extraction_field` (e.g. `"patient_name"` or `"invoice_number"`). The `validate_documents` node, after the AI call, will parse that field from the response and call `PATCH /api/runs/{id}` to set `name`. The Validate page will then show "Invoice #12345" instead of "invoice_scan_final_v2.pdf".

### Future: policy chaining

Policy chaining stays in the Validate section. The user picks an ordered list of policies. Under the hood, the canonical pipeline grows: `input → pdf_to_images → validate_documents(policy_A) → validate_documents(policy_B) → show_results`. Each validate step gets its own `WorkflowRunStep`. The results drawer will show a tabbed view, one tab per policy.

---

## Known Gotchas

- **Port 6379 conflict**: If you have a local Redis running, the docker-compose redis service has no host port mapping — that's intentional. Containers communicate via the `redis` hostname internally.
- **413 on uploads**: nginx defaults to 1MB. The `nginx.conf` sets `client_max_body_size 100M`. If you hit this, check the nginx config.
- **SSE buffering**: nginx must have `proxy_buffering off` for the `/api/runs/*/stream` endpoint or SSE events batch up. Already set in `nginx.conf`.
- **FK crash in worker**: If you add a new ORM model with FK references to another model, you must import the referenced model in `celery_app.py`. SQLAlchemy resolves FK targets lazily at first access; if a model is never imported in the worker process, it can't resolve the FK.
- **React Flow CSS artifacts**: See the CSS section above. Every new node type needs its class added to `index.css`.
- **Celery chain first arg**: Do NOT add the first positional arg for task 2+ in a chain. Celery injects the previous return value automatically. Passing it again causes mismatched args.
- **validate_documents passthrough**: The `validate_documents` node passes `image_paths` and `document_id` through in its output_data so downstream `output` nodes can still access the images even after validation.
- **OpenRouter key empty by default**: The `.env` ships with `OPENROUTER_API_KEY=` empty. Runs with a `validate_documents` node will fail with a clear error ("OpenRouter API key not configured…") until the key is set in Settings or `.env`.
- **validate_documents direct file input**: When there are no `image_paths` in `input_data` (i.e. connected directly to the ingest node, not through pdf_to_images), the task checks `file_path`. PDFs are converted inline via pymupdf; images (png/jpg/jpeg/webp/gif) are encoded directly. The `file_path` may be absolute or relative to `STORAGE_PATH`.
- **Celery worker does not auto-reload**: The API source (`api/app/`) is a volume mount, so uvicorn picks up Python changes automatically. The Celery worker does NOT — it imports task modules at startup and holds them in memory. After editing any task file (`nodes/*.py`, `executor.py`, etc.), you must `docker compose restart worker` to pick up the changes.
- **validate_documents + fail_on_missing**: `fail_on_missing` defaults to `False` — the run continues even if required rules fail. When `fail_on_missing=True` and a required rule fails, the step is marked `completed` (so its output is visible) but the *run* is marked `failed`. The step output with validation details is still accessible for debugging.
- **ValidateDocumentsNode is the focal node**: It is 260px wide (vs 200px for other nodes), has a violet border visible even when unselected, and displays the policy's rule list directly on the canvas. During a run, all rules pulse indigo together ("checking"); after the step completes they resolve to pass/fail/uncertain icons. The same live status appears in the NodeConfigPanel config section with full evidence text. The node fetches its policy rules via `usePolicy(policy_id)` and tracks the active run via `useRunContext().activeRunId` + `useRun(activeRunId)` — both poll/share TanStack Query cache without extra SSE connections.

---

## Theming System

The app supports **light / dark / system** modes. The active mode is saved to `localStorage` under the key `theme`. ThemeProvider in `frontend/src/context/theme.tsx` applies/removes the `dark` class on `<html>` and listens to OS changes when in system mode.

All colors are CSS custom properties defined in `frontend/src/index.css`:
- `:root` defines the **light** values
- `.dark` overrides with **dark** values

**Never write hardcoded hex colors in components.** Always use the CSS variable via Tailwind's arbitrary value syntax:

```
bg-[var(--c-bg)]        border-[var(--c-border)]     text-[var(--c-text-1)]
bg-[var(--c-surface)]   border-[var(--c-border-2)]   text-[var(--c-text-2)]
bg-[var(--c-surface-2)] border-[var(--c-border-3)]   text-[var(--c-text-3)]
bg-[var(--c-surface-3)] divide-[var(--c-divider)]    text-[var(--c-text-4)]
                                                      text-[var(--c-text-5)]
hover:bg-[var(--c-hover-1)]                           text-[var(--c-text-6)]
hover:bg-[var(--c-hover-2)]
hover:bg-[var(--c-hover-3)]
bg-[var(--c-active)]   ← selected/active nav items
```

React Flow props use variables directly in style objects:
```tsx
style={{ background: 'var(--c-bg)' }}
maskColor="var(--c-rf-mask)"
color="var(--c-rf-dot)"   // Background dots
```

---

## Design Language

The UI is intentionally minimal and commercial — think Linear, Vercel dashboard, Raycast. No gradients, no decorative shadows, no colored backgrounds, no multiple accent colors competing. Every element earns its place.

### Color Tokens (dark → light)

| Token | Dark | Light | Usage |
|---|---|---|---|
| `--c-bg` | #0a0a0a | #f5f5f5 | Page background |
| `--c-surface` | #111 | #ffffff | Cards, panels, modals |
| `--c-surface-2` | #0d0d0d | #f8f8f8 | Alternate surface |
| `--c-surface-3` | #1a1a1a | #f0f0f0 | Badges, hover states |
| `--c-border` | #1a1a1a | #e8e8e8 | Primary borders |
| `--c-border-2` | #222 | #d4d4d4 | Node/input borders |
| `--c-border-3` | #2a2a2a | #bbbbbb | Hover borders |
| `--c-divider` | #141414 | #eeeeee | List dividers |
| `--c-text-1` | #e8e8e8 | #111 | Primary text |
| `--c-text-2` | #aaa | #555 | Secondary text |
| `--c-text-3` | #888 | #777 | Muted text |
| `--c-text-4` | #666 | #999 | Subtle text |
| `--c-text-5` | #444 | #aaa | Faint text |
| `--c-text-6` | #2a2a2a | #bbb | Ghost text |
| `--c-hover-1` | rgba(255,255,255,0.02) | rgba(0,0,0,0.03) | Hover bg light |
| `--c-hover-2` | rgba(255,255,255,0.03) | rgba(0,0,0,0.04) | Hover bg medium |
| `--c-hover-3` | rgba(255,255,255,0.04) | rgba(0,0,0,0.05) | Hover bg strong |
| `--c-active` | rgba(255,255,255,0.06) | rgba(0,0,0,0.07) | Active/selected bg |

### Semantic Colors (status only, never decorative)

```
emerald-400   completed / success / output nodes
amber-400     unsaved indicator / transform nodes / warnings
red-400       failed / errors
indigo-400    running / loading / input nodes
indigo-600    buttons, active states (only interactive accent)
```

### Typography

- Font: Inter / system-ui (set in `index.css`)
- Base: 14px html root; component sizes via `text-[Npx]` — never Tailwind named sizes
- No bold except headings and button labels; use color contrast instead

### Spacing & Shape

- Border radius: `rounded-lg` (8px) for cards/modals, `rounded-md` (6px) for inputs/buttons, `rounded` (4px) for tags
- Node width: 200px fixed
- Sidebar width: 220px
- Top bar height: 52px (`h-[52px]`)
- Dividers: `divide-[var(--c-divider)]` for lists, `border-[var(--c-border)]` for structural

### Component Patterns

**Buttons**
```
Primary:   bg-indigo-600 text-white px-3 h-7 text-[12px] font-medium rounded hover:bg-indigo-500
Secondary: border border-[var(--c-border-2)] text-[var(--c-text-3)] px-3 h-7 rounded hover:border-[var(--c-border-3)] hover:text-[var(--c-text-2)]
Ghost:     text-[var(--c-text-4)] px-2.5 py-1.5 rounded hover:text-[var(--c-text-2)] hover:bg-[var(--c-hover-3)]
Danger:    hover:text-red-400 hover:bg-red-500/10
```

**Inputs**
```
border border-[var(--c-border-2)] bg-[var(--c-surface)] px-3 py-1.5 text-[13px] text-[var(--c-text-1)]
placeholder-[var(--c-text-5)] rounded outline-none
focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20
```

**Cards / Nodes**
```
bg-[var(--c-surface)] border border-[var(--c-border-2)] rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.5)]
hover:  border-[var(--c-border-3)]
selected: border-indigo-500/60 shadow-[0_0_0_1px_rgba(99,102,241,0.3)]
```

**Modals**
```
bg-[var(--c-surface)] border border-[var(--c-border-2)] rounded-xl shadow-2xl
Backdrop: bg-black/60 backdrop-blur-sm
```

**Tables / Lists**
- Table layout (not cards) for list pages
- `divide-y divide-[var(--c-divider)]` between rows
- Header row: `text-[11px] font-medium text-[var(--c-text-5)]`
- Row hover: `hover:bg-[var(--c-hover-1)]`

**Left Sidebar**
```
w-[220px] bg-[var(--c-bg)] border-r border-[var(--c-border)]
Active item: bg-[var(--c-active)] text-[var(--c-text-1)] rounded-md
Inactive:    text-[var(--c-text-4)] hover:text-[var(--c-text-2)] hover:bg-[var(--c-hover-2)]
Section label: text-[10px] font-semibold uppercase tracking-wider text-[var(--c-text-5)]
```

**Node Icon Squares**
```
h-[22px] w-[22px] rounded-[5px]
input:           bg-indigo-500/15  + text-indigo-400
pdf_to_images:   bg-amber-500/15   + text-amber-400
output:          bg-emerald-500/15 + text-emerald-400
validate_documents / show_results: bg-violet-500/15 + text-violet-400
```

### What Not to Do

- No gradients (`bg-gradient-*`)
- No colored backgrounds on page sections
- No multiple accent colors — indigo is the only interactive accent
- No emoji in production UI
- No glassmorphism / frosted glass effects
- No borders with opacity > 0.15 unless it's an active/selected state
- No `rounded-full` on anything except handle dots and status dots
- **No hardcoded hex colors in components** — always use `var(--c-xxx)` CSS variables
