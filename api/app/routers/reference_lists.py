"""Phase 7 — reference lists: named, editable lists of approved/known values
that a policy rule can check an extracted value against."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.reference_list import ReferenceList
from app.schemas.reference_list import ReferenceListCreate, ReferenceListOut, ReferenceListUpdate
from app.security import get_current_tenant_id

router = APIRouter()


def _clean_items(items) -> list[str]:
    """Normalise items: strings, trimmed, no blanks, de-duplicated (order-preserving)."""
    seen: set[str] = set()
    out: list[str] = []
    for raw in items or []:
        s = str(raw).strip()
        if s and s.lower() not in seen:
            seen.add(s.lower())
            out.append(s)
    return out


def _get_owned(db: Session, list_id: int, tenant_id: int) -> ReferenceList:
    rl = db.get(ReferenceList, list_id)
    if not rl or rl.tenant_id != tenant_id:
        raise HTTPException(404, "Reference list not found")
    return rl


@router.get("/", response_model=list[ReferenceListOut])
def list_reference_lists(db: Session = Depends(get_db), tenant_id: int = Depends(get_current_tenant_id)):
    return (
        db.query(ReferenceList)
        .filter(ReferenceList.tenant_id == tenant_id)
        .order_by(ReferenceList.created_at.desc())
        .all()
    )


@router.post("/", response_model=ReferenceListOut, status_code=201)
def create_reference_list(
    body: ReferenceListCreate,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    rl = ReferenceList(
        tenant_id=tenant_id,
        name=body.name.strip() or "Untitled list",
        description=body.description,
        items=_clean_items(body.items),
    )
    db.add(rl)
    db.commit()
    db.refresh(rl)
    return rl


@router.get("/{list_id}", response_model=ReferenceListOut)
def get_reference_list(
    list_id: int,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    return _get_owned(db, list_id, tenant_id)


@router.put("/{list_id}", response_model=ReferenceListOut)
def update_reference_list(
    list_id: int,
    body: ReferenceListUpdate,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    rl = _get_owned(db, list_id, tenant_id)
    data = body.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        rl.name = data["name"].strip() or rl.name
    if "description" in data:
        rl.description = data["description"]
    if "items" in data and data["items"] is not None:
        rl.items = _clean_items(data["items"])
    db.commit()
    db.refresh(rl)
    return rl


@router.delete("/{list_id}", status_code=204)
def delete_reference_list(
    list_id: int,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    rl = _get_owned(db, list_id, tenant_id)
    db.delete(rl)
    db.commit()
