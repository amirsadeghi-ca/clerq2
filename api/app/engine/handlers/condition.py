"""`condition` node — a structured predicate (no eval) that branches the graph.

Config: ``{"field": "results.0.status", "op": "eq", "value": "fail"}``.
Returns ``Branch`` with ``live_handles=["true"]`` or ``["false"]``; the scheduler
prunes the other outgoing edge and skips its now-unreachable sub-branch.

Supported ops: truthy/falsy, exists, eq/ne, contains, gt/lt/gte/lte. `field` is a
dot-path into the merged upstream input (list indices allowed: ``results.0.status``).
"""
from __future__ import annotations

from typing import Any

from app.engine.context import Branch, StepContext


def _resolve(data: Any, path: str | None) -> Any:
    if not path:
        return None
    cur = data
    for part in str(path).split("."):
        if isinstance(cur, dict):
            cur = cur.get(part)
        elif isinstance(cur, list):
            try:
                cur = cur[int(part)]
            except (ValueError, IndexError):
                return None
        else:
            return None
    return cur


def _as_float(v: Any) -> float | None:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _eq(actual: Any, expected: Any) -> bool:
    if actual == expected:
        return True
    # tolerant string compare (e.g. "fail" vs "Fail", numbers vs strings)
    return str(actual).strip().lower() == str(expected).strip().lower()


def evaluate(cfg: dict, data: dict) -> bool:
    op = str(cfg.get("op") or "truthy").lower()
    actual = _resolve(data, cfg.get("field"))
    expected = cfg.get("value")

    if op in ("truthy", "is_true"):
        return bool(actual)
    if op in ("falsy", "is_false"):
        return not bool(actual)
    if op == "exists":
        return actual is not None
    if op == "eq":
        return _eq(actual, expected)
    if op == "ne":
        return not _eq(actual, expected)
    if op == "contains":
        if isinstance(actual, (list, tuple, dict)):
            return expected in actual
        return expected is not None and str(expected) in str(actual or "")
    if op in ("gt", "lt", "gte", "lte"):
        a, b = _as_float(actual), _as_float(expected)
        if a is None or b is None:
            return False
        return {
            "gt": a > b, "lt": a < b, "gte": a >= b, "lte": a <= b,
        }[op]
    return bool(actual)


def condition(ctx: StepContext) -> Branch:
    data = dict(ctx.primary_input())
    result = evaluate(ctx.config or {}, data)
    ctx.log(f"condition {ctx.node_id}: {ctx.config.get('field')} {ctx.config.get('op')} "
            f"{ctx.config.get('value')!r} → {result}")
    data["condition_result"] = result
    return Branch(data=data, live_handles=["true" if result else "false"])
