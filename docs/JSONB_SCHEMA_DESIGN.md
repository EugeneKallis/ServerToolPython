# AppSettings JSONB Schema Design

## Context

Current tables to consolidate into JSONB key/value store:
- `macro_group`, `macro`, `command`, `command_argument` (hierarchical)
- `arr_instance`
- `quick_link`
- `app_preferences` (new — currently does not exist)

`MacroSchedule` and `ScriptRun` are **excluded** — they represent execution state/events and should remain as normal rows.

---

## 1. JSONB Key Structure

Each row in `app_settings` has a `key` (PK) and a `value` (JSONB). Top-level keys:

```
app_settings.key = "arr_instances"   → JSONB array
app_settings.key = "macro_groups"    → JSONB array
app_settings.key = "quick_links"     → JSONB array
app_settings.key = "app_preferences" → JSONB object
```

### `arr_instances`

```json
{
  "arr_instances": [
    {
      "id": 1,
      "name": "Radarr (Movies)",
      "type": "radarr",
      "url": "http://radarr:7878",
      "api_key": "...secret...",
      "enabled": true
    }
  ]
}
```

- `id` is a transient local identifier (not assigned by ARR, local DB auto-increment)
- `name` is unique within the array
- Same 5 fields as existing `ArrInstance` model

### `macro_groups`

```json
{
  "macro_groups": [
    {
      "id": 1,
      "name": "System Maintenance",
      "ord": 0,
      "macros": [
        {
          "id": 1,
          "name": "Clean Temp Files",
          "ord": 0,
          "commands": [
            {
              "id": 1,
              "ord": 0,
              "command": "rm -rf /tmp/*",
              "arguments": [
                { "id": 1, "arg_name": "Force", "arg_value": "--force" }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

- Nested structure mirrors the existing `MacroGroup → Macro → Command → CommandArgument` hierarchy
- `id` fields are local auto-increment identifiers
- `arguments` is optional (empty array if none)

### `quick_links`

```json
{
  "quick_links": [
    { "id": 1, "label": "Plex",    "url": "http://plex:32400", "ord": 0 },
    { "id": 2, "label": "Sonarr",  "url": "http://sonarr:8989", "ord": 1 }
  ]
}
```

- Same 4 fields as existing `QuickLink` model

### `app_preferences`

```json
{
  "app_preferences": {
    "theme": "dark",
    "default_macro_group_id": null,
    "terminal_font_size": 14
  }
}
```

- Free-form key/value object for UI preferences
- No predefined schema — individual keys are added as needed

---

## 2. SQLAlchemy Model

```python
class AppSettings(Base):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String, primary_key=True)
    value: Mapped[dict] = mapped_column(JSONB, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
```

- `key` is the primary key — appsettings uses it as a singleton store per key
- `value` is a `dict` Python type (SQLAlchemy maps to PostgreSQL JSONB)
- No separate `id` column
- GIN index on `value` for JSONB path queries if needed

```python
# Index for JSONB containment queries (if used)
from sqlalchemy.dialects.postgresql import JSONB
Index("ix_app_settings_value", AppSettings.value, postgresql_using="gin")
```

---

## 3. Migration Plan

### Phase 1: Create new table + populate (backward-compatible)

Add a migration that:
1. Creates `app_settings` table with PK on `key` and GIN index on `value`
2. Populates `arr_instances` from existing `arr_instance` rows
3. Populates `macro_groups` by walking existing `macro_group → macro → command → command_argument` hierarchy
4. Populates `quick_links` from existing `quick_link` rows
5. Initializes `app_preferences` as empty `{}`

```python
# Pseudocode for migration population
session = Session(bind=connection)

# Populate arr_instances
rows = session.query(ArrInstance).all()
arr_instances_data = [{"id": r.id, "name": r.name, "type": r.type,
                        "url": r.url, "api_key": r.api_key, "enabled": r.enabled}
                       for r in rows]
session.execute(insert(AppSettings).values(key="arr_instances",
                                           value={"arr_instances": arr_instances_data}))

# Populate macro_groups by walking hierarchy (similar pattern)
# Populate quick_links
# Insert app_preferences: {}
```

### Phase 2: Validate

- Verify all existing data is reflected in JSONB
- Confirm API endpoints that read/write these resources work identically

### Phase 3: Switch writes to JSONB

- Router handlers for macro_groups, arr_instances, quick_links start writing to `app_settings` JSONB
- Read paths also point to JSONB
- Old tables still exist (data frozen)

### Phase 4: Deprecate + drop old tables

- After one release cycle, old tables can be dropped via migration
- Cascade deletes from `macro_group` will remove orphan macros/commands/arguments

---

## 4. Deprecation Path for Old Tables

| Table | Action | Timing |
|---|---|---|
| `arr_instance` | Keep during migration, drop after JSONB write path is stable | Phase 4 |
| `macro_group` | Keep (cascade to macro/command/command_argument) during migration | Phase 4 |
| `macro` | Keep via macro_group cascade | Phase 4 |
| `command` | Keep via macro cascade | Phase 4 |
| `command_argument` | Keep via command cascade | Phase 4 |
| `quick_link` | Keep during migration, drop after JSONB write path is stable | Phase 4 |

Drop migration is straightforward after data is validated:

```python
def upgrade() -> None:
    op.drop_table("quick_link")
    op.drop_table("command_argument")
    op.drop_table("command")
    op.drop_table("macro")
    op.drop_table("macro_group")
    op.drop_table("arr_instance")
```

---

## 5. Backward Compatibility Concerns

### ARR instance lookups from `arr_config.py`

Current `broadcast_arr_config()` queries `ArrInstance` table directly:

```python
# arr_config.py — current
instances = db.query(ArrInstance).all()
```

**Fix**: Query from JSONB instead:

```python
# arr_config.py — updated
row = db.query(AppSettings).filter(AppSettings.key == "arr_instances").first()
instances = row.value["arr_instances"] if row else []
```

Broadcast Redis channel `"arr_config_updates"` remains the same payload format — no downstream changes needed.

### Existing API endpoints

Router handlers (`/macro-groups`, `/arr-instances`, `/quick-links`) must be updated to read/write `AppSettings` JSONB. The Pydantic schemas in `schemas.py` can remain unchanged — they validate the data shape, not the storage mechanism.

### Import/Export

The existing `POST /macro-groups/import` endpoint (which replaces all groups) writes by deleting and recreating rows. With JSONB this becomes a single `UPDATE app_settings SET value = :new_value WHERE key = 'macro_groups'`.

Full export/import of the combined blob:

```python
# Export all
rows = db.query(AppSettings).all()
export_blob = {row.key: row.value for row in rows}

# Import all (replace all keys)
for key, value in import_blob.items():
    db.query(AppSettings).filter(AppSettings.key == key).update({"value": value})
db.commit()
```

### `MacroSchedule` table

`MacroSchedule` references `macro.id` and must remain as a normal row. When macro groups are migrated to JSONB, the `macro.id` values remain valid identifiers within the JSONB blob — no FK enforcement, but IDs are stable.

---

## 6. Settings Key Naming Convention

```
app_settings.key value column contains:
  "arr_instances"     → array of ARR instance objects
  "macro_groups"      → array of nested group/macro/command/argument objects
  "quick_links"       → array of quick link objects
  "app_preferences"   → object of UI preference key/values
```

No prefixes needed since `key` is namespaced per row. Full qualified name when specifying: `app_settings.arr_instances`.

---

## Summary

- **Target model**: single `app_settings` table with `(key PK, value JSONB, updated_at)`
- **4 top-level keys**: `arr_instances`, `macro_groups`, `quick_links`, `app_preferences`
- **Migration**: populate JSONB from existing tables in one Alembic migration, then switch read/write paths
- **Deprecation**: keep old tables through migration window, drop in a later migration
- **ARR config**: update `broadcast_arr_config()` to read from JSONB; Redis pub/sub format unchanged
- **Env vars** (`OLLAMA_HOST`, `MAGNET_BRIDGE_URL`, etc.): stay in `.env` — not affected