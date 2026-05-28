"""Phase 7 — reference lists: named, editable lists of approved/known values
that a policy rule can check an extracted value against."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.reference_list import ReferenceList
from app.schemas.reference_list import ReferenceListCreate, ReferenceListOut, ReferenceListUpdate

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


@router.get("/", response_model=list[ReferenceListOut])
def list_reference_lists(db: Session = Depends(get_db)):
    return db.query(ReferenceList).order_by(ReferenceList.created_at.desc()).all()


@router.post("/", response_model=ReferenceListOut, status_code=201)
def create_reference_list(body: ReferenceListCreate, db: Session = Depends(get_db)):
    rl = ReferenceList(
        name=body.name.strip() or "Untitled list",
        description=body.description,
        items=_clean_items(body.items),
    )
    db.add(rl)
    db.commit()
    db.refresh(rl)
    return rl


@router.get("/{list_id}", response_model=ReferenceListOut)
def get_reference_list(list_id: int, db: Session = Depends(get_db)):
    rl = db.get(ReferenceList, list_id)
    if not rl:
        raise HTTPException(404, "Reference list not found")
    return rl


@router.put("/{list_id}", response_model=ReferenceListOut)
def update_reference_list(list_id: int, body: ReferenceListUpdate, db: Session = Depends(get_db)):
    rl = db.get(ReferenceList, list_id)
    if not rl:
        raise HTTPException(404, "Reference list not found")
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
def delete_reference_list(list_id: int, db: Session = Depends(get_db)):
    rl = db.get(ReferenceList, list_id)
    if not rl:
        raise HTTPException(404, "Reference list not found")
    db.delete(rl)
    db.commit()
