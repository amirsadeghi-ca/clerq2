"""Seed the engine-v2 flexibility-showcase workflow.

Run inside the api container:
    docker compose exec api python samples/demo-workflow/seed.py [tenant_id]

Builds a workflow that exercises every engine-v2 capability in one graph:

    input → pdf_to_images → validate_documents
          → condition(overall == "fail")
                ├─(true)→ completeness_gate → send_email("please resubmit") ┐
                └─(false)→ show_results ──────────────────────────────────┤
                                                                    join → output

  * fan-out + join     : both branches converge on `output`
  * conditional skip   : the untaken branch (and its chain) is skipped
  * suspend/resume     : completeness_gate parks the run as `waiting` until the
                         missing document arrives (signal) or the timeout fires

It is buildable/visible in the workflow editor. Running it end-to-end needs an
OpenRouter key (the validate_documents node calls a vision model).
"""
import sys

from app.database import SessionLocal
# Import all models first so SQLAlchemy resolves cross-model relationships — the
# `Case` ORM name otherwise clashes with sqlalchemy.sql.elements.Case in ad-hoc
# scripts (see CLAUDE.md). Order matters: register everything before mapping.
from app.models import (  # noqa: F401
    auth, case, document, document_type, mail, reference_list, run, run_step, setting,
)
from app.models.policy import Policy, PolicyRule
from app.models.workflow import Workflow
from app.models.workflow_version import WorkflowVersion


def _demo_definition(policy_id: int) -> dict:
    return {
        "nodes": [
            {"id": "input", "type": "input", "data": {}, "position": {"x": 0, "y": 0}},
            {"id": "pdf", "type": "pdf_to_images", "data": {"scale": 2.0}, "position": {"x": 0, "y": 110}},
            {"id": "validate", "type": "validate_documents",
             "data": {"policy_id": policy_id}, "position": {"x": 0, "y": 220}},
            {"id": "cond", "type": "condition",
             "data": {"field": "overall", "op": "eq", "value": "fail"}, "position": {"x": 0, "y": 330}},
            {"id": "gate", "type": "completeness_gate",
             "data": {"required_doc_types": [], "timeout_days": 7}, "position": {"x": -180, "y": 440}},
            {"id": "resubmit", "type": "send_email",
             "data": {"to": "{{sender_email}}", "subject": "Documents required",
                      "body": "Please resubmit the missing documents."}, "position": {"x": -180, "y": 550}},
            {"id": "results", "type": "show_results", "data": {}, "position": {"x": 180, "y": 440}},
            {"id": "output", "type": "output", "data": {}, "position": {"x": 0, "y": 660}},
        ],
        "edges": [
            {"id": "e1", "source": "input", "target": "pdf"},
            {"id": "e2", "source": "pdf", "target": "validate"},
            {"id": "e3", "source": "validate", "target": "cond"},
            {"id": "e4", "source": "cond", "target": "gate", "sourceHandle": "true"},
            {"id": "e5", "source": "gate", "target": "resubmit"},
            {"id": "e6", "source": "cond", "target": "results", "sourceHandle": "false"},
            {"id": "e7", "source": "resubmit", "target": "output"},
            {"id": "e8", "source": "results", "target": "output"},
        ],
    }


def main(tenant_id: int = 1) -> None:
    with SessionLocal() as db:
        policy = Policy(tenant_id=tenant_id, name="Demo policy", brief="Demo validation policy.",
                        current_version_num=1)
        db.add(policy)
        db.flush()
        db.add(PolicyRule(policy_id=policy.id, position=0, name="Document is signed",
                          requirement="required", scope="per_document"))
        definition = _demo_definition(policy.id)
        wf = Workflow(tenant_id=tenant_id, name="Demo — branch + gate showcase",
                      description="Fan-out, conditional skip, join, and a suspend/resume gate.",
                      definition=definition, current_version_num=1)
        db.add(wf)
        db.flush()
        db.add(WorkflowVersion(workflow_id=wf.id, version_num=1, definition=definition))
        db.commit()
        print(f"Seeded demo workflow #{wf.id} + policy #{policy.id} for tenant {tenant_id}")


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 1)
