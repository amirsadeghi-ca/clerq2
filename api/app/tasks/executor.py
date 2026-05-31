from datetime import datetime, UTC

from celery import chain

from app.database import SessionLocal
from app.models.document import Document
from app.models.run import WorkflowRun, WorkflowRunStep, WorkflowRunDocument
from app.tasks.registry import NODE_REGISTRY


def _fail_run(run_id: int, error: str) -> None:
    """Mark a run failed synchronously (used when a chain can't be built)."""
    with SessionLocal() as db:
        run = db.get(WorkflowRun, run_id)
        if run and run.status in ("pending", "running"):
            run.status = "failed"
            run.error = error
            run.completed_at = datetime.now(UTC)
            db.commit()


def _topological_sort(nodes: list[dict], edges: list[dict]) -> list[dict]:
    """Kahn's algorithm — returns nodes in execution order."""
    id_to_node = {n["id"]: n for n in nodes}
    in_degree = {n["id"]: 0 for n in nodes}
    adj: dict[str, list[str]] = {n["id"]: [] for n in nodes}

    for edge in edges:
        src, tgt = edge.get("source"), edge.get("target")
        # Ignore dangling edges that reference a node not in the graph (can happen
        # with a corrupt/partially-edited definition). Letting them through would
        # KeyError here and strand the already-committed run in "pending" forever.
        if src not in id_to_node or tgt not in id_to_node:
            continue
        adj[src].append(tgt)
        in_degree[tgt] += 1

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


def trigger_run(run_id: int, definition: dict, docs: list[Document]) -> None:
    """
    Enqueue a Celery chain for run_id.

    docs must be a non-empty list. For single-document runs pass [doc].
    The first element is treated as the primary document (backward compat
    for nodes/flows that only understand a single file).
    """
    if not docs:
        _fail_run(run_id, "No documents provided for this run")
        return

    nodes = definition.get("nodes", []) or []
    edges = definition.get("edges", []) or []
    if not nodes:
        _fail_run(run_id, "Workflow has no nodes — nothing to run. Add at least one node and save.")
        return

    sorted_nodes = _topological_sort(nodes, edges)
    if len(sorted_nodes) < len(nodes):
        _fail_run(run_id, "Workflow graph contains a cycle — execution order can't be determined.")
        return

    # Validate all node types are known before creating any step records.
    unknown = [n.get("type") for n in sorted_nodes if n.get("type") not in NODE_REGISTRY]
    if unknown:
        _fail_run(run_id, f"Unknown node type(s): {', '.join(str(u) for u in unknown)}")
        return

    primary_doc = docs[0]

    with SessionLocal() as db:
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

        # Record the document set for this run
        for i, doc in enumerate(docs):
            db.add(WorkflowRunDocument(run_id=run_id, document_id=doc.id, position=i))

        db.commit()
        for _, step in step_records:
            db.refresh(step)

        # Build initial input.
        # Always includes a structured `documents` list so nodes can handle multi-doc sets.
        # Top-level single-doc fields (document_id, file_path, mime_type) are kept for
        # backward compat with nodes that don't look at `documents`
        # (e.g. workflow-editor chains that start from email_input → pdf_to_images).
        docs_list = [
            {
                "id": doc.id,
                "file_path": doc.file_path,
                "mime_type": doc.mime_type or "",
                "filename": doc.original_filename,
            }
            for doc in docs
        ]

        initial_input = {
            # Backward compat — primary document
            "document_id": primary_doc.id,
            "file_path": primary_doc.file_path,
            "mime_type": primary_doc.mime_type,
            # Multi-doc list (always present, single-element for single-doc runs)
            "documents": docs_list,
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
