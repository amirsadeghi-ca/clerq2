"""Pure helpers shared by engine tests: definition builders + DB readers."""
from __future__ import annotations

from app.database import SessionLocal


def make_def(nodes: list[dict], edges: list[dict] | None = None) -> dict:
    return {"nodes": nodes, "edges": edges or []}


def n(node_id: str, node_type: str = "echo", **data) -> dict:
    """A node. Extra kwargs become node.data (config)."""
    return {"id": node_id, "type": node_type, "data": data}


def e(source: str, target: str, source_handle: str | None = None) -> dict:
    edge = {"source": source, "target": target}
    if source_handle is not None:
        edge["sourceHandle"] = source_handle
    return edge


def run_status(run_id: int) -> str:
    from app.models.run import WorkflowRun
    with SessionLocal() as db:
        return db.get(WorkflowRun, run_id).status


def run_result(run_id: int):
    from app.models.run import WorkflowRun
    with SessionLocal() as db:
        return db.get(WorkflowRun, run_id).result


def step_by_node(run_id: int, node_id: str):
    from app.models.run_step import RunStep
    with SessionLocal() as db:
        return db.query(RunStep).filter(
            RunStep.run_id == run_id, RunStep.node_id == node_id
        ).order_by(RunStep.id.desc()).first()


def step_status(run_id: int, node_id: str):
    s = step_by_node(run_id, node_id)
    return s.status if s else None


def all_steps(run_id: int) -> dict[str, str]:
    from app.models.run_step import RunStep
    with SessionLocal() as db:
        return {s.node_id: s.status for s in db.query(RunStep).filter(
            RunStep.run_id == run_id).all()}
