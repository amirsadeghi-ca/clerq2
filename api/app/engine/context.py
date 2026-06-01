"""Node handler interface: StepContext + the Output / Suspend / Branch results.

A handler is a plain function ``(StepContext) -> Output | Suspend | Branch``.
Handlers never touch run/step status or the queue — all bookkeeping lives in the
scheduler. Inputs are multi-parent (``{upstream_node_id: output}``), which breaks
the old single-input coupling. See docs/workflow-engine-rewrite-plan.md.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Callable, Optional

from app.engine.storage import Storage


class CancelledError(Exception):
    """Raised inside a handler (via ctx.check_cancelled) when the run was cancelled."""


class StepFailed(Exception):
    """A definitive step failure that still wants its partial output persisted.

    e.g. validate_documents with fail_on_missing: the verdict output must be
    saved (so the report renders) even though the step is marked failed.
    """

    def __init__(self, message: str, output: dict | None = None) -> None:
        super().__init__(message)
        self.output = output or {}


@dataclass
class Output:
    """Terminal success — the step produced this output dict."""

    data: dict = field(default_factory=dict)


@dataclass
class Suspend:
    """Park the step as ``waiting`` until a matching event or timer fires."""

    event_type: str
    match_key: str | None = None
    fire_at: datetime | None = None
    payload: dict | None = None


@dataclass
class Branch:
    """Success + conditional pruning. Only outgoing edges whose ``source_handle``
    is in ``live_handles`` stay live; the rest are pruned and their unreachable
    sub-branches are skipped by the scheduler."""

    data: dict
    live_handles: list[str]


# A handler returns one of these (or a bare dict, treated as Output(dict)).
HandlerResult = Output | Suspend | Branch | dict | None
Handler = Callable[["StepContext"], HandlerResult]


@dataclass
class StepContext:
    step_id: int
    run_id: int
    tenant_id: int
    node_id: str
    node_type: str
    config: dict                      # node.data
    inputs: dict                      # {upstream_node_id: output}; roots seeded with {"_run": {...}}
    attempt: int
    idempotency_key: str
    storage: Storage
    log: Callable[[str], None]
    _cancelled_check: Optional[Callable[[], bool]] = None

    # ── helpers handlers use ────────────────────────────────────────────────
    def check_cancelled(self) -> None:
        """Raise CancelledError if the run was cancelled — call at checkpoints
        inside long handlers."""
        if self._cancelled_check is not None and self._cancelled_check():
            raise CancelledError("Run was cancelled")

    def primary_input(self) -> dict:
        """Deterministic shallow-merge of all upstream outputs (by node_id),
        including the ``_run`` seed. Use for templating / generic field access."""
        merged: dict[str, Any] = {}
        for key in sorted(self.inputs.keys()):
            val = self.inputs[key]
            if isinstance(val, dict):
                merged.update(val)
        return merged

    def documents(self) -> list[dict]:
        """The run's document set. Prefer a `documents` list emitted by an
        upstream node; fall back to the `_run` seed so even a root sees them."""
        for key in sorted(self.inputs.keys()):
            if key == "_run":
                continue
            val = self.inputs[key]
            if isinstance(val, dict) and isinstance(val.get("documents"), list):
                return val["documents"]
        seed = self.inputs.get("_run")
        if isinstance(seed, dict) and isinstance(seed.get("documents"), list):
            return seed["documents"]
        return []

    def setting(self, key: str) -> str | None:
        """Tenant-scoped AppSetting value (e.g. OPENROUTER_API_KEY). Returns the
        stored value or None; handlers apply their own env fallback."""
        from app.database import SessionLocal
        from app.models.setting import AppSetting

        with SessionLocal() as db:
            row = db.get(AppSetting, (self.tenant_id, key))
            if row and (row.value or "").strip():
                return row.value
        return None
