from celery import chain

from app.database import SessionLocal
from app.models.document import Document
from app.models.run import WorkflowRun, WorkflowRunStep
from app.tasks.registry import NODE_REGISTRY


def _topological_sort(nodes: list[dict], edges: list[dict]) -> list[dict]:
    """Kahn's algorithm — returns nodes in execution order."""
    id_to_node = {n["id"]: n for n in nodes}
    in_degree = {n["id"]: 0 for n in nodes}
    adj: dict[str, list[str]] = {n["id"]: [] for n in nodes}

    for edge in edges:
        adj[edge["source"]].append(edge["target"])
        in_degree[edge["target"]] += 1

    queue = [nid for nid, deg in in_degree.items() if deg == 0]
    result = []
    while queue:
        nid = queue.pop(0)
        result.append(id_to_node[nid])
        for neighbor in adj[nid]:
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    return result


def trigger_run(run_id: int, definition: dict, doc: Document) -> None:
    nodes = definition.get("nodes", [])
    edges = definition.get("edges", [])

    if not nodes:
        return

    sorted_nodes = _topological_sort(nodes, edges)

    with SessionLocal() as db:
        run = db.get(WorkflowRun, run_id)
        step_records = []
        for node in sorted_nodes:
            step = WorkflowRunStep(
                run_id=run_id,
                node_id=node["id"],
                node_type=node["type"],
                status="pending",
            )
            db.add(step)
            step_records.append((node, step))
        db.commit()
        for _, step in step_records:
            db.refresh(step)

        # Build Celery chain.
        # First task: .s(initial_input_data, run_id=, step_id=)
        # Subsequent tasks: .s(run_id=, step_id=)  ← input_data is injected by Celery from prev result
        initial_input = {
            "document_id": doc.id,
            "file_path": doc.file_path,
            "mime_type": doc.mime_type,
        }

        signatures = []
        for i, (node, step) in enumerate(step_records):
            task_fn = NODE_REGISTRY.get(node["type"])
            if not task_fn:
                raise ValueError(f"Unknown node type: {node['type']}")

            node_config = node.get("data", {}) or {}

            if i == 0:
                sig = task_fn.s(initial_input, run_id=run_id, step_id=step.id, node_config=node_config)
            else:
                sig = task_fn.s(run_id=run_id, step_id=step.id, node_config=node_config)

            signatures.append(sig)

        chain(*signatures).delay()
