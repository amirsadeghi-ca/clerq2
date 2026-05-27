from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

import httpx

from app.config import settings as env_settings
from app.database import get_db
from app.models.setting import AppSetting

router = APIRouter()

SETTING_KEYS = ["openrouter_api_key", "openrouter_default_model"]


def _get(db: Session, key: str, fallback: str = "") -> str:
    row = db.get(AppSetting, key)
    return row.value if row else fallback


def _set(db: Session, key: str, value: str) -> None:
    row = db.get(AppSetting, key)
    if row:
        row.value = value
    else:
        db.add(AppSetting(key=key, value=value))
    db.commit()


class SettingsOut(BaseModel):
    openrouter_api_key: str
    openrouter_default_model: str
    openrouter_api_key_set: bool


class SettingsUpdate(BaseModel):
    openrouter_api_key: str | None = None
    openrouter_default_model: str | None = None


class ModelInfo(BaseModel):
    id: str
    name: str


class TestResult(BaseModel):
    ok: bool
    response: str | None = None
    error: str | None = None


@router.get("/", response_model=SettingsOut)
def get_settings(db: Session = Depends(get_db)):
    key = _get(db, "openrouter_api_key", env_settings.openrouter_api_key)
    model = _get(db, "openrouter_default_model", env_settings.openrouter_default_model)
    return SettingsOut(
        openrouter_api_key=key,
        openrouter_default_model=model,
        openrouter_api_key_set=bool(key),
    )


@router.put("/", response_model=SettingsOut)
def update_settings(body: SettingsUpdate, db: Session = Depends(get_db)):
    if body.openrouter_api_key is not None:
        _set(db, "openrouter_api_key", body.openrouter_api_key)
    if body.openrouter_default_model is not None:
        _set(db, "openrouter_default_model", body.openrouter_default_model)
    return get_settings(db)


@router.get("/models", response_model=list[ModelInfo])
def list_models(db: Session = Depends(get_db)):
    key = _get(db, "openrouter_api_key", env_settings.openrouter_api_key)
    if not key:
        raise HTTPException(status_code=400, detail="OpenRouter API key not configured")
    try:
        resp = httpx.get(
            "https://openrouter.ai/api/v1/models",
            headers={"Authorization": f"Bearer {key}"},
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json().get("data", [])
        models = [ModelInfo(id=m["id"], name=m.get("name") or m["id"]) for m in data]
        models.sort(key=lambda m: m.id)
        return models
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"OpenRouter error: {exc.response.status_code}")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.post("/test", response_model=TestResult)
def test_connection(db: Session = Depends(get_db)):
    key = _get(db, "openrouter_api_key", env_settings.openrouter_api_key)
    if not key:
        return TestResult(ok=False, error="API key not configured")
    try:
        resp = httpx.get(
            "https://openrouter.ai/api/v1/models",
            headers={"Authorization": f"Bearer {key}"},
            timeout=15,
        )
        if resp.status_code == 401:
            return TestResult(ok=False, error="Invalid API key")
        resp.raise_for_status()
        count = len(resp.json().get("data", []))
        return TestResult(ok=True, response=f"{count} models available")
    except httpx.HTTPStatusError as exc:
        return TestResult(ok=False, error=f"OpenRouter returned {exc.response.status_code}")
    except Exception as exc:
        return TestResult(ok=False, error=str(exc))
