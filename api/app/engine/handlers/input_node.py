"""`input` node — anchors the run's document set for downstream nodes."""
from __future__ import annotations

from app.engine.context import Output, StepContext


def input_node(ctx: StepContext) -> Output:
    docs = ctx.documents()
    ctx.log(f"Input: {len(docs)} document(s)")
    return Output({"documents": docs})
