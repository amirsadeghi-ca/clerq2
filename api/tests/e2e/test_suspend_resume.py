"""completeness_gate suspend/resume — the flexibility showcase: a run parks as
`waiting` until the missing document arrives (or the timeout fires)."""
from app.database import SessionLocal
from app.engine import scheduler
from app.engine.events import signal_event_tx
from tests.helpers import make_def, n, run_status, step_status


def _doc_type(tenant_id, name="Passport"):
    from app.models.document_type import DocumentType
    with SessionLocal() as db:
        dt = DocumentType(tenant_id=tenant_id, name=name)
        db.add(dt)
        db.commit()
        return dt.id


def _make_case(tenant_id):
    from app.models.case import Case
    with SessionLocal() as db:
        c = Case(tenant_id=tenant_id, name="Dossier", status="open", target_kind="policy")
        db.add(c)
        db.commit()
        return c.id


def _attach_doc(tenant_id, case_id, dt_id):
    from app.models.case import CaseDocument
    from app.models.document import Document
    with SessionLocal() as db:
        doc = Document(tenant_id=tenant_id, filename="x.pdf", original_filename="x.pdf",
                       file_path="/tmp/x.pdf", mime_type="application/pdf", size_bytes=1)
        db.add(doc)
        db.flush()
        db.add(CaseDocument(tenant_id=tenant_id, case_id=case_id, document_id=doc.id,
                            document_type_id=dt_id, source="upload", position=0))
        db.commit()


def _gate_run(tenant_id, run_factory, case_id, dt_id, timeout_days=7):
    run_id = run_factory()
    with SessionLocal() as db:
        from app.models.run import WorkflowRun
        db.get(WorkflowRun, run_id).case_id = case_id
        db.commit()
    definition = make_def([n("g", "completeness_gate",
                             required_doc_types=[dt_id], timeout_days=timeout_days)])
    with SessionLocal() as db:
        scheduler.start_run(db, tenant_id=tenant_id, run_id=run_id,
                            definition=definition, documents=[])
    return run_id


def test_gate_parks_then_resumes_when_document_arrives(tenant_id, run_factory, drive_run):
    dt_id = _doc_type(tenant_id)
    case_id = _make_case(tenant_id)
    run_id = _gate_run(tenant_id, run_factory, case_id, dt_id)

    drive_run(run_id)
    assert step_status(run_id, "g") == "waiting"
    assert run_status(run_id) == "waiting"  # parked, not done

    # The applicant sends the missing document → attach + signal.
    _attach_doc(tenant_id, case_id, dt_id)
    ready = signal_event_tx("document_added", str(case_id))
    assert ready  # the parked gate was readied

    drive_run(run_id)
    assert step_status(run_id, "g") == "succeeded"
    assert run_status(run_id) == "completed"


def test_gate_resume_still_missing_reparks(tenant_id, run_factory, drive_run):
    dt_id = _doc_type(tenant_id, "Passport")
    other = _doc_type(tenant_id, "Other")
    case_id = _make_case(tenant_id)
    run_id = _gate_run(tenant_id, run_factory, case_id, dt_id)

    drive_run(run_id)
    assert run_status(run_id) == "waiting"

    # A different document arrives — still missing the required one → re-parks.
    _attach_doc(tenant_id, case_id, other)
    signal_event_tx("document_added", str(case_id))
    drive_run(run_id)
    assert step_status(run_id, "g") == "waiting"
    assert run_status(run_id) == "waiting"


def test_gate_times_out_and_proceeds(tenant_id, run_factory, drive_run):
    dt_id = _doc_type(tenant_id)
    case_id = _make_case(tenant_id)
    run_id = _gate_run(tenant_id, run_factory, case_id, dt_id, timeout_days=0)

    drive_run(run_id)  # deadline already passed → proceeds (timed out), no park
    assert step_status(run_id, "g") == "succeeded"
    assert run_status(run_id) == "completed"
    from tests.helpers import step_by_node
    out = step_by_node(run_id, "g").output_data
    assert out["complete"] is False and out["timed_out"] is True
