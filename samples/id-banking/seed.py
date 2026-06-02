"""Seed an identity & banking verification use case (config + data only).

Library document types: Government-issued photo ID, Passport, Bank statement.
Policy: "Identity & banking verification" with per-document validity rules +
cross-set name-consistency and completeness rules.

Idempotent: skips anything already present (matched by name) for the tenant.

Run inside the api container:
    docker compose exec -T api python - < samples/id-banking/seed.py [tenant_id]
"""
import sys

from app.database import SessionLocal
# Import all models first (the `Case` ORM name clashes with sqlalchemy's Case in
# ad-hoc scripts — see CLAUDE.md).
from app.models import (  # noqa: F401
    auth, case, document, document_type, mail, reference_list, run, run_step, setting,
)
from app.models.document_type import DocumentType
from app.models.policy import Policy, PolicyRule, PolicyVersion

DOC_TYPES = [
    ("Government-issued photo ID",
     "A government-issued photo identity document — driver's licence, provincial/state ID card, "
     "or national ID card — showing the holder's full name, photograph, date of birth, a document "
     "number, and an expiry date.",
     "Confirm the document is issued by a government authority and shows a photograph, the holder's "
     "full legal name, date of birth, a document/ID number, and an expiry date. Read the full name "
     "and the expiry date precisely."),
    ("Passport",
     "The identity (bio) page of a passport showing the holder's surname and given names, "
     "nationality, passport number, date of birth, date of issue, and date of expiry.",
     "Read the surname and given names, the passport number, the date of issue, and the date of "
     "expiry. Confirm the bio / identity page is present and legible."),
    ("Bank statement",
     "A bank account statement showing the account holder's name, the financial institution, the "
     "statement period or date, and account activity or balance.",
     "Read the account holder's full name, the institution name, the statement date or period, and "
     "the closing balance. Confirm it is a genuine account statement, not just a screenshot of a balance."),
]

POLICY_NAME = "Identity & banking verification"
POLICY_BRIEF = (
    "Verify a person's identity and banking documents. The set concerns ONE individual. Confirm that "
    "a government-issued photo ID and a passport are present and unexpired, that a recent bank statement "
    "is provided, and that the holder's name is consistent across all documents. Mark a rule "
    "not_applicable for a document it does not concern (e.g. the passport rule for a bank statement). "
    "Verdict: Recevable (verified) / Information manquante (follow up) / Non recevable (not verified)."
)

# (name, requirement, scope, accept_criteria, fail_criteria, doc_type_name|None)
RULES = [
    ("Government-issued photo ID is valid and unexpired", "required", "any_document",
     "a government-issued photo ID is present and its expiry date is in the future",
     "no government photo ID is present, or the ID is expired",
     "Government-issued photo ID"),
    ("Passport is present and unexpired", "required", "any_document",
     "a passport bio page is present and its expiry date is in the future",
     "no passport is present, or the passport is expired",
     "Passport"),
    ("Bank statement is recent", "required", "any_document",
     "a bank statement dated within roughly the last 90 days is present",
     "no bank statement is present, or the most recent one is older than ~90 days",
     "Bank statement"),
    ("Holder name is consistent across all documents", "required", "cross_set",
     "the person's full name matches on the photo ID, the passport, and the bank statement",
     "the holder's name differs between documents",
     None),
    ("Required documents are all present", "required", "cross_set",
     "the set contains a government-issued photo ID, a passport, and a bank statement",
     "one or more of the required documents is missing from the set",
     None),
]


def _get_or_create_doc_type(db, tenant_id, name, desc, ai):
    dt = db.query(DocumentType).filter(
        DocumentType.tenant_id == tenant_id, DocumentType.name == name).first()
    if dt:
        print(f"    · doc type exists: {name!r} (#{dt.id})")
        return dt
    dt = DocumentType(tenant_id=tenant_id, name=name, description=desc, ai_instructions=ai)
    db.add(dt)
    db.flush()
    print(f"    + doc type created: {name!r} (#{dt.id})")
    return dt


def main(tenant_id: int = 1):
    with SessionLocal() as db:
        dt_by_name = {}
        for name, desc, ai in DOC_TYPES:
            dt_by_name[name] = _get_or_create_doc_type(db, tenant_id, name, desc, ai)

        existing = db.query(Policy).filter(
            Policy.tenant_id == tenant_id, Policy.name == POLICY_NAME).first()
        if existing:
            print(f"    · policy exists: {POLICY_NAME!r} (#{existing.id}) — leaving as-is")
            policy = existing
        else:
            policy = Policy(tenant_id=tenant_id, name=POLICY_NAME, brief=POLICY_BRIEF,
                            current_version_num=1)
            db.add(policy)
            db.flush()
            for i, (rname, req, scope, accept, fail, dt_name) in enumerate(RULES):
                db.add(PolicyRule(
                    policy_id=policy.id, position=i, name=rname, requirement=req, scope=scope,
                    accept_criteria=accept, fail_criteria=fail,
                    document_type_id=dt_by_name[dt_name].id if dt_name else None,
                    reference_direction="in", reference_match="smart",
                ))
            db.add(PolicyVersion(policy_id=policy.id, version_num=1,
                                 snapshot={"rules": [r[0] for r in RULES]}))
            db.flush()
            print(f"    + policy created: {POLICY_NAME!r} (#{policy.id}) with {len(RULES)} rules")
        db.commit()
        print(f"\nDone. tenant={tenant_id}  policy #{policy.id}  doc_types={[d.id for d in dt_by_name.values()]}")


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 1)
