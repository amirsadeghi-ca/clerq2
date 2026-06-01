"""Trivial echo handler — used by the engine test suite to exercise the
scheduler (sequential, fan-out, join) without any real node logic."""
from __future__ import annotations

from app.engine.context import Output, StepContext


def echo(ctx: StepContext) -> Output:
    ctx.log(f"echo: {ctx.node_id}")
    data = dict(ctx.primary_input())
    # Append to a trail so tests can assert execution order / join merging.
    trail = list(data.get("_echo_trail") or [])
    trail.append(ctx.node_id)
    data["_echo_trail"] = trail
    if "message" in (ctx.config or {}):
        data["message"] = ctx.config["message"]
    return Output(data)
