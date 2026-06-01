"""HANDLERS registry — node_type → handler function. Replaces NODE_REGISTRY.

`completeness_gate` is added in Phase 5.
"""
from __future__ import annotations

from app.engine.context import Handler
from app.engine.handlers.ai import ai_node
from app.engine.handlers.completeness_gate import completeness_gate
from app.engine.handlers.condition import condition
from app.engine.handlers.echo import echo
from app.engine.handlers.email_input import email_input
from app.engine.handlers.input_node import input_node
from app.engine.handlers.output_node import output_node
from app.engine.handlers.pdf_to_images import pdf_to_images
from app.engine.handlers.send_email import send_email_node
from app.engine.handlers.show_results import show_results
from app.engine.handlers.validate_documents import validate_documents

HANDLERS: dict[str, Handler] = {
    # 8 ported production nodes
    "input": input_node,
    "pdf_to_images": pdf_to_images,
    "validate_documents": validate_documents,
    "show_results": show_results,
    "output": output_node,
    "email_input": email_input,
    "ai": ai_node,
    "send_email": send_email_node,
    # flexibility nodes
    "condition": condition,
    "completeness_gate": completeness_gate,
    "echo": echo,
}


def register(node_type: str, handler: Handler) -> None:
    HANDLERS[node_type] = handler
