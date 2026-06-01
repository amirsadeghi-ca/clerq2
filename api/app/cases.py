import secrets
from datetime import datetime, timezone
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.case import Case, CaseAlias, CaseDocument


def new_email_token() -> str:
    """Generate a short URL-safe token used to identify a case in reply-to addresses."""
    return secrets.token_urlsafe(12).lower()


def resolve_or_create_case(
    db: Session,
    tenant_id: int,
    *,
    target_kind: str | None = None,
    policy_id: int | None = None,
    workflow_id: int | None = None,
    contact_email: str | None = None,
    contact_name: str | None = None,
    email_token: str | None = None,
    external_ref: str | None = None,
    name: str | None = None,
) -> Case:
    """Find an existing case via email_token or external_ref, or create a new one.

    For email inbound: pass email_token (parsed from +token suffix of recipient address).
    For manual or API: pass external_ref.
    One-shot validate/workflow runs: pass neither; always creates a new case.
    """
    # Try email_token lookup (cross-tenant-safe: aliases are tenant-scoped)
    if email_token:
        alias = (
            db.query(CaseAlias)
            .filter(
                CaseAlias.tenant_id == tenant_id,
                CaseAlias.alias_type == "email_token",
                func.lower(CaseAlias.alias_value) == email_token.lower(),
            )
            .first()
        )
        if alias:
            return alias.case

    # Try external_ref lookup
    if external_ref:
        existing = (
            db.query(Case)
            .filter(Case.tenant_id == tenant_id, Case.external_ref == external_ref)
            .first()
        )
        if existing:
            return existing

    # Create new case
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    case = Case(
        tenant_id=tenant_id,
        name=name,
        status="open",
        target_kind=target_kind,
        policy_id=policy_id,
        workflow_id=workflow_id,
        contact_email=contact_email,
        contact_name=contact_name,
        external_ref=external_ref,
        created_at=now,
        updated_at=now,
        last_activity_at=now,
    )
    db.add(case)
    db.flush()  # get case.id without committing

    # Register email_token alias if this is email-originated
    if contact_email or email_token:
        token = email_token or new_email_token()
        alias = CaseAlias(
            tenant_id=tenant_id,
            case_id=case.id,
            alias_type="email_token",
            alias_value=token,
            created_at=now,
        )
        db.add(alias)
        db.flush()

    return case


def get_case_email_token(case: Case) -> str | None:
    """Return the email_token alias value for a case, or None if not set."""
    for alias in (case.aliases or []):
        if alias.alias_type == "email_token":
            return alias.alias_value
    return None


def ensure_case_email_token(db: Session, case: Case, tenant_id: int) -> str:
    """Return or create an email_token alias for the case."""
    token = get_case_email_token(case)
    if token:
        return token
    token = new_email_token()
    db.add(CaseAlias(
        tenant_id=tenant_id,
        case_id=case.id,
        alias_type="email_token",
        alias_value=token,
    ))
    db.flush()
    return token


def attach_run_to_case(db: Session, case: Case, run) -> None:
    """Link a run to a case and bump last_activity_at."""
    run.case_id = case.id
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    case.last_activity_at = now
    case.updated_at = now


def attach_document_to_case(db: Session, case: Case, document, source: str = "validate") -> CaseDocument:
    """Attach a document to a case.

    Supersedes any prior non-superseded CaseDocument with the same original_filename
    (simple filename-based supersession; AI doc-type slot matching is a future refinement).
    """
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    # Find supersession candidates (same filename, not already superseded)
    existing = (
        db.query(CaseDocument)
        .filter(
            CaseDocument.case_id == case.id,
            CaseDocument.superseded_by_id.is_(None),
        )
        .join(CaseDocument.document)
        .filter_by(original_filename=document.original_filename)
        .all()
    )

    # Determine position
    max_pos_row = (
        db.query(CaseDocument)
        .filter(CaseDocument.case_id == case.id)
        .order_by(CaseDocument.position.desc())
        .first()
    )
    position = (max_pos_row.position + 1) if max_pos_row else 0

    cd = CaseDocument(
        tenant_id=case.tenant_id,
        case_id=case.id,
        document_id=document.id,
        source=source,
        position=position,
        added_at=now,
    )
    db.add(cd)
    db.flush()

    # Mark prior same-filename docs as superseded
    for old_cd in existing:
        old_cd.superseded_by_id = cd.id

    case.last_activity_at = now
    case.updated_at = now
    return cd


def current_document_ids(db: Session, case: Case) -> list[int]:
    """Return non-superseded document IDs for the case, ordered by position."""
    rows = (
        db.query(CaseDocument)
        .filter(
            CaseDocument.case_id == case.id,
            CaseDocument.superseded_by_id.is_(None),
        )
        .order_by(CaseDocument.position)
        .all()
    )
    return [r.document_id for r in rows]


def compute_checklist(db: Session, case: Case) -> list[dict]:
    """Derive expected-document checklist from policy rules and latest run results.

    Returns [] for workflow-target cases (no policy = no rule-based expectations).
    Each item: {document_type: {id, name}, required: bool, status: "satisfied"|"partial"|"missing"}
    """
    if not case.policy_id:
        return []

    from app.models.policy import Policy
    policy = db.get(Policy, case.policy_id)
    if not policy:
        return []

    # Build expected types from rules that have a document_type_id
    expected: dict[int, dict] = {}
    for rule in policy.rules:
        if rule.document_type_id and rule.document_type:
            dt_id = rule.document_type_id
            if dt_id not in expected:
                expected[dt_id] = {
                    "document_type": {"id": rule.document_type.id, "name": rule.document_type.name},
                    "required": False,
                    "rule_names": [],
                }
            expected[dt_id]["rule_names"].append(rule.name)
            if rule.requirement.lower() == "required":
                expected[dt_id]["required"] = True

    if not expected:
        return []

    # Get the latest completed validate_documents step for this case
    from app.models.run import WorkflowRun, WorkflowRunStep
    from sqlalchemy import desc
    latest_run = (
        db.query(WorkflowRun)
        .filter(
            WorkflowRun.case_id == case.id,
            WorkflowRun.status == "completed",
        )
        .order_by(desc(WorkflowRun.created_at))
        .first()
    )

    # Map document_type.name → checklist status from per_document n/a markers
    dt_status: dict[int, str] = {dt_id: "missing" for dt_id in expected}

    if latest_run:
        for step in latest_run.steps:
            if step.node_type == "validate_documents" and step.status == "completed" and step.output_data:
                results = step.output_data.get("results", [])
                for result in results:
                    rule_name = result.get("rule_name", "")
                    # Find matching rule
                    for rule in policy.rules:
                        if rule.name == rule_name and rule.document_type_id in expected:
                            dt_id = rule.document_type_id
                            per_doc = result.get("per_document", [])
                            applicable = [p for p in per_doc if p.get("status") != "not_applicable"]
                            if not applicable:
                                # all n/a — type is missing; don't override "satisfied"
                                if dt_status.get(dt_id) != "satisfied":
                                    dt_status[dt_id] = "missing"
                            else:
                                has_pass = any(p.get("status") == "pass" for p in applicable)
                                has_fail = any(p.get("status") in ("fail", "uncertain") for p in applicable)
                                if has_pass and not has_fail:
                                    dt_status[dt_id] = "satisfied"
                                elif has_pass:
                                    dt_status[dt_id] = "partial"
                                else:
                                    if dt_status.get(dt_id) != "satisfied":
                                        dt_status[dt_id] = "partial"

    result_list = []
    for dt_id, info in expected.items():
        result_list.append({
            "document_type": info["document_type"],
            "required": info["required"],
            "status": dt_status.get(dt_id, "missing"),
        })
    return result_list


def update_case_status_from_run(db: Session, case: Case, overall: str | None) -> None:
    """Suggest a status transition based on the latest run verdict.

    Only transitions from "open". Human can always override.
    """
    if case.status not in ("open", "awaiting_applicant"):
        return
    if overall == "pass":
        case.status = "open"  # reviewer closes manually
    elif overall in ("fail", "needs_review"):
        case.status = "awaiting_applicant"
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    case.updated_at = now
