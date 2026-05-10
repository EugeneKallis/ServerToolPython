"""
sync_settings_from_tables.py

Reads all data from the existing relational tables and writes them
into the `app_settings` JSONB key/value store.

Tables consumed:
  - arr_instance        → app_settings.key="arr_instances"
  - macro_group → macro → command → command_argument  → app_settings.key="macro_groups"
  - quick_link          → app_settings.key="quick_links"
  - (app_preferences is initialised as {})

Run once as a migration step after `add_app_settings_jsonb` has been applied.
Can be re-run safely (idempotent upsert).
"""

import sys
import os
from datetime import datetime

# Ensure the app package is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.database import SessionLocal
from app.models import (
    ArrInstance,
    MacroGroup,
    Macro,
    Command,
    CommandArgument,
    QuickLink,
    AppSettings,
)


def _upsert(session, key: str, value: dict) -> None:
    stmt = pg_insert(AppSettings).values(key=key, value=value)
    stmt = stmt.on_conflict_do_update(index_elements=["key"], set_={"value": stmt.excluded.value})
    session.execute(stmt)


def sync_arr_instances(session) -> None:
    rows = session.scalars(select(ArrInstance)).all()
    data = [
        {
            "id": r.id,
            "name": r.name,
            "type": r.type,
            "url": r.url,
            "api_key": r.api_key,
            "enabled": r.enabled,
        }
        for r in rows
    ]
    _upsert(session, "arr_instances", {"arr_instances": data})
    print(f"[sync] arr_instances → {len(data)} rows written")


def sync_macro_groups(session) -> None:
    # Load full hierarchy
    rows = session.scalars(
        select(MacroGroup).order_by(MacroGroup.ord, MacroGroup.id)
    ).all()

    groups = []
    for group in rows:
        macros = []
        for macro in sorted(group.macros, key=lambda m: (m.ord, m.id)):
            commands = []
            for cmd in sorted(macro.commands, key=lambda c: (c.ord, c.id)):
                arguments = [
                    {"id": a.id, "arg_name": a.arg_name, "arg_value": a.arg_value}
                    for a in sorted(cmd.arguments, key=lambda a: a.id)
                ]
                commands.append({
                    "id": cmd.id,
                    "ord": cmd.ord,
                    "command": cmd.command,
                    "arguments": arguments,
                })
            macros.append({
                "id": macro.id,
                "name": macro.name,
                "ord": macro.ord,
                "commands": commands,
            })
        groups.append({
            "id": group.id,
            "name": group.name,
            "ord": group.ord,
            "macros": macros,
        })

    _upsert(session, "macro_groups", {"macro_groups": groups})
    print(f"[sync] macro_groups → {len(groups)} groups written")


def sync_quick_links(session) -> None:
    rows = session.scalars(select(QuickLink).order_by(QuickLink.ord, QuickLink.id)).all()
    data = [
        {"id": r.id, "label": r.label, "url": r.url, "ord": r.ord}
        for r in rows
    ]
    _upsert(session, "quick_links", {"quick_links": data})
    print(f"[sync] quick_links → {len(data)} rows written")


def sync_app_preferences(session) -> None:
    _upsert(session, "app_preferences", {"app_preferences": {}})
    print("[sync] app_preferences → initialized as {{}}")


def main() -> None:
    session = SessionLocal()
    try:
        sync_arr_instances(session)
        sync_macro_groups(session)
        sync_quick_links(session)
        sync_app_preferences(session)
        session.commit()
        print("[sync] All settings synced successfully.")
    except Exception as e:
        session.rollback()
        print(f"[sync] Error: {e}")
        raise
    finally:
        session.close()


if __name__ == "__main__":
    main()