from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.policy import Policy, PolicyRule, PolicyVersion
from app.schemas.policy import (
    PolicyCreate, PolicyOut, PolicyRuleCreate, PolicyRuleOut, PolicyRuleUpdate,
    PolicyUpdate, PolicyVersionOut,
)

router = APIRouter()


def _snapshot(policy: Policy) -> dict:
    return {
        "name": policy.name,
        "brief": policy.brief,
        "description": policy.description,
        "rules": [
            {
                "position": r.position,
                "name": r.name,
                "requirement": r.requirement,
                "scope": r.scope,
                "accept_criteria": r.accept_criteria,
                "fail_criteria": r.fail_criteria,
                "ai_instructions": r.ai_instructions,
                "document_type_id": r.document_type_id,
                "confidence_threshold": r.confidence_threshold,
            }
            for r in policy.rules
        ],
    }


def _make_version(db: Session, policy: Policy) -> PolicyVersion:
    next_num = (db.scalar(
        select(func.max(PolicyVersion.version_num)).where(PolicyVersion.policy_id == policy.id)
    ) or 0) + 1
    v = PolicyVersion(policy_id=policy.id, version_num=next_num, snapshot=_snapshot(policy))
    db.add(v)
    policy.current_version_num = next_num
    return v


def _version_out(v: PolicyVersion) -> PolicyVersionOut:
    return PolicyVersionOut(
        id=v.id,
        policy_id=v.policy_id,
        version_num=v.version_num,
        snapshot=v.snapshot,
        rule_count=len((v.snapshot or {}).get("rules", [])),
        created_at=v.created_at,
    )


@router.get("/", response_model=list[PolicyOut])
def list_policies(db: Session = Depends(get_db)):
    return db.query(Policy).order_by(Policy.created_at.desc()).all()


@router.post("/", response_model=PolicyOut, status_code=201)
def create_policy(body: PolicyCreate, db: Session = Depends(get_db)):
    policy = Policy(**body.model_dump())
    db.add(policy)
    db.commit()
    db.refresh(policy)
    return policy


@router.get("/{policy_id}", response_model=PolicyOut)
def get_policy(policy_id: int, db: Session = Depends(get_db)):
    policy = db.get(Policy, policy_id)
    if not policy:
        raise HTTPException(404, "Policy not found")
    return policy


@router.put("/{policy_id}", response_model=PolicyOut)
def update_policy(policy_id: int, body: PolicyUpdate, db: Session = Depends(get_db)):
    policy = db.get(Policy, policy_id)
    if not policy:
        raise HTTPException(404, "Policy not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(policy, field, value)
    _make_version(db, policy)
    db.commit()
    db.refresh(policy)
    return policy


@router.delete("/{policy_id}", status_code=204)
def delete_policy(policy_id: int, db: Session = Depends(get_db)):
    policy = db.get(Policy, policy_id)
    if not policy:
        raise HTTPException(404, "Policy not found")
    db.delete(policy)
    db.commit()


@router.get("/{policy_id}/versions", response_model=list[PolicyVersionOut])
def list_policy_versions(policy_id: int, db: Session = Depends(get_db)):
    policy = db.get(Policy, policy_id)
    if not policy:
        raise HTTPException(404, "Policy not found")
    versions = (
        db.query(PolicyVersion)
        .filter(PolicyVersion.policy_id == policy_id)
        .order_by(PolicyVersion.version_num.desc())
        .all()
    )
    return [_version_out(v) for v in versions]


@router.post("/{policy_id}/versions/{version_id}/restore", response_model=PolicyOut)
def restore_policy_version(policy_id: int, version_id: int, db: Session = Depends(get_db)):
    policy = db.get(Policy, policy_id)
    if not policy:
        raise HTTPException(404, "Policy not found")
    version = db.get(PolicyVersion, version_id)
    if not version or version.policy_id != policy_id:
        raise HTTPException(404, "Version not found")

    snap = version.snapshot
    policy.name = snap.get("name", policy.name)
    policy.brief = snap.get("brief", policy.brief)
    policy.description = snap.get("description", policy.description)

    for rule in list(policy.rules):
        db.delete(rule)
    db.flush()

    for rule_data in snap.get("rules", []):
        rule = PolicyRule(
            policy_id=policy_id,
            position=rule_data["position"],
            name=rule_data["name"],
            requirement=rule_data.get("requirement", "required"),
            scope=rule_data.get("scope", "per_document"),
            accept_criteria=rule_data.get("accept_criteria"),
            fail_criteria=rule_data.get("fail_criteria"),
            ai_instructions=rule_data.get("ai_instructions"),
            document_type_id=rule_data.get("document_type_id"),
            confidence_threshold=rule_data.get("confidence_threshold", 0.75),
        )
        db.add(rule)
    db.flush()

    _make_version(db, policy)
    db.commit()
    db.refresh(policy)
    return policy


@router.post("/{policy_id}/rules", response_model=PolicyRuleOut, status_code=201)
def create_rule(policy_id: int, body: PolicyRuleCreate, db: Session = Depends(get_db)):
    policy = db.get(Policy, policy_id)
    if not policy:
        raise HTTPException(404, "Policy not found")
    max_pos = max((r.position for r in policy.rules), default=-1)
    rule = PolicyRule(policy_id=policy_id, position=max_pos + 1, **body.model_dump())
    db.add(rule)
    db.flush()
    _make_version(db, policy)
    db.commit()
    db.refresh(rule)
    return rule


@router.put("/{policy_id}/rules/{rule_id}", response_model=PolicyRuleOut)
def update_rule(policy_id: int, rule_id: int, body: PolicyRuleUpdate, db: Session = Depends(get_db)):
    rule = db.get(PolicyRule, rule_id)
    if not rule or rule.policy_id != policy_id:
        raise HTTPException(404, "Rule not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(rule, field, value)
    db.commit()
    db.refresh(rule)
    return rule


@router.delete("/{policy_id}/rules/{rule_id}", status_code=204)
def delete_rule(policy_id: int, rule_id: int, db: Session = Depends(get_db)):
    rule = db.get(PolicyRule, rule_id)
    if not rule or rule.policy_id != policy_id:
        raise HTTPException(404, "Rule not found")
    db.delete(rule)
    policy = db.get(Policy, policy_id)
    if policy:
        db.flush()
        _make_version(db, policy)
    db.commit()


@router.post("/{policy_id}/enable-inbox", response_model=PolicyOut)
def enable_policy_inbox(policy_id: int, db: Session = Depends(get_db)):
    policy = db.get(Policy, policy_id)
    if not policy:
        raise HTTPException(404, "Policy not found")
    policy.email_inbox_enabled = True
    policy.email_address = f"policy-{policy_id}@clerq.local"
    db.commit()
    db.refresh(policy)
    return policy


@router.post("/{policy_id}/disable-inbox", response_model=PolicyOut)
def disable_policy_inbox(policy_id: int, db: Session = Depends(get_db)):
    policy = db.get(Policy, policy_id)
    if not policy:
        raise HTTPException(404, "Policy not found")
    policy.email_inbox_enabled = False
    policy.email_address = None
    db.commit()
    db.refresh(policy)
    return policy


@router.patch("/{policy_id}/rules/reorder", response_model=PolicyOut)
def reorder_rules(policy_id: int, body: dict, db: Session = Depends(get_db)):
    policy = db.get(Policy, policy_id)
    if not policy:
        raise HTTPException(404, "Policy not found")
    rule_ids: list[int] = body.get("rule_ids", [])
    rule_map = {r.id: r for r in policy.rules}
    for pos, rid in enumerate(rule_ids):
        if rid in rule_map:
            rule_map[rid].position = pos
    db.flush()
    _make_version(db, policy)
    db.commit()
    db.refresh(policy)
    return policy
