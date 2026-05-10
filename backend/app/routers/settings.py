from typing import Dict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from ..database import get_session
from ..models import AppSettings
from ..schemas import (
    AppSettingsRead,
    AppSettingsUpdate,
    ArrInstancesPayload,
    MacroGroupsPayload,
    QuickLinksPayload,
    AppPreferencesPayload,
)

router = APIRouter(prefix="/settings", tags=["settings"])


def _upsert(key: str, value: dict, session: Session) -> AppSettings:
    """Upsert a single app_settings row."""
    stmt = pg_insert(AppSettings).values(key=key, value=value)
    stmt = stmt.on_conflict_do_update(index_elements=["key"], set_={"value": stmt.excluded.value})
    session.execute(stmt)
    session.commit()
    row = session.query(AppSettings).filter(AppSettings.key == key).first()
    return row


@router.get("", response_model=Dict[str, dict])
def get_all_settings(session: Session = Depends(get_session)):
    """Return all key/value pairs as a flat dict {key: value}."""
    rows = session.query(AppSettings).all()
    return {row.key: row.value for row in rows}


@router.get("/export", response_model=Dict[str, dict])
def export_settings(session: Session = Depends(get_session)):
    """Return the full combined blob of all settings."""
    return get_all_settings(session)


@router.get("/{key}", response_model=AppSettingsRead)
def get_setting(key: str, session: Session = Depends(get_session)):
    row = session.query(AppSettings).filter(AppSettings.key == key).first()
    if not row:
        raise HTTPException(status_code=404, detail=f"Setting '{key}' not found")
    return row


@router.put("/{key}", response_model=AppSettingsRead)
def upsert_setting(key: str, payload: AppSettingsUpdate, session: Session = Depends(get_session)):
    """Upsert a single key."""
    return _upsert(key, payload.value, session)


@router.put("", response_model=Dict[str, dict])
def bulk_upsert(payload: Dict[str, dict], session: Session = Depends(get_session)):
    """Bulk upsert — accepts a dict of key→value pairs."""
    for key, value in payload.items():
        _upsert(key, value, session)
    return get_all_settings(session)


@router.post("/import", response_model=Dict[str, dict])
def import_settings(payload: Dict[str, dict], session: Session = Depends(get_session)):
    """Replace all settings from a full JSON payload.

    Mirrors the macro_groups/import pattern: validates the shape via
    key-specific Pydantic schemas before committing.
    """
    # Validate known keys
    for key in ["arr_instances", "macro_groups", "quick_links", "app_preferences"]:
        if key in payload:
            if key == "arr_instances":
                ArrInstancesPayload(**payload[key])
            elif key == "macro_groups":
                MacroGroupsPayload(**payload[key])
            elif key == "quick_links":
                QuickLinksPayload(**payload[key])
            elif key == "app_preferences":
                AppPreferencesPayload(**payload[key])

    for key, value in payload.items():
        _upsert(key, value, session)

    return get_all_settings(session)