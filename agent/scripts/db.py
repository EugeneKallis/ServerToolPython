"""
db.py — Shared database helpers for agent scripts.

Usage in any script:
    from db import get_session, ArrInstance
    with get_session() as db:
        instances = db.query(ArrInstance).filter(ArrInstance.enabled == True).all()

To log a script run automatically (captures stdout, timing, success/failure):
    from db import log_run
    with log_run("arr_searcher"):
        main()
"""

import io
import os
import sys
import traceback
from contextlib import contextmanager
from datetime import datetime, timezone

from sqlalchemy import create_engine, Column, Integer, String, Boolean, Text, Float, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker, Session

# ─── Engine ──────────────────────────────────────────────────────────────────

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@db:5432/postgres")
_engine = create_engine(DATABASE_URL)
_SessionFactory = sessionmaker(bind=_engine, expire_on_commit=False)

Base = declarative_base()

# ─── Models ───────────────────────────────────────────────────────────────────

class ArrInstance(Base):
    """Radarr / Sonarr instance config stored in Postgres."""
    __tablename__ = "arr_instance"

    id      = Column(Integer, primary_key=True)
    name    = Column(String)
    type    = Column(String)   # "radarr" | "sonarr"
    url     = Column(String)
    api_key = Column(String)
    enabled = Column(Boolean, default=True)


class ScriptRun(Base):
    """One row per agent script execution."""
    __tablename__ = "script_run"

    id               = Column(Integer, primary_key=True)
    macro_name       = Column(String, index=True)
    started_at       = Column(DateTime)
    finished_at      = Column(DateTime, nullable=True)
    duration_seconds = Column(Float, nullable=True)
    success          = Column(Boolean, nullable=True)
    output           = Column(Text, nullable=True)


# ─── Session helper ───────────────────────────────────────────────────────────

@contextmanager
def get_session() -> Session:
    """Context manager that yields a SQLAlchemy session and handles cleanup."""
    db = _SessionFactory()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


# ─── Run logger ───────────────────────────────────────────────────────────────

@contextmanager
def log_run(macro_name: str):
    """
    Context manager that captures stdout, measures runtime, and writes a
    ScriptRun row to the database. Starts with success=None to indicate "Running".

    If AGENT_RUN_NAME environment variable is set, it overrides the macro_name argument.
    """
    # Override with env var if present (set by agent main.py from Redis payload)
    macro_name = os.environ.get("AGENT_RUN_NAME", macro_name)
    
    started_at = datetime.now(timezone.utc).replace(tzinfo=None)  # store as naive UTC
    
    # 1. Create the entry immediately to show "Running" in UI
    run_id = None
    try:
        db = _SessionFactory()
        run = ScriptRun(
            macro_name=macro_name,
            started_at=started_at,
            success=None, # Indicates "Running"
        )
        db.add(run)
        db.commit()
        run_id = run.id
        db.close()
    except Exception as e:
        print(f"[log_run] Failed to pre-save run to DB: {e}", file=sys.stderr)

    # 2. Capture stdout so we can save it to the DB
    buf = io.StringIO()
    old_stdout = sys.stdout
    sys.stdout = buf

    success = False
    exc_info = None
    try:
        yield
        success = True
    except KeyboardInterrupt:
        exc_info = "Interrupted by user."
        raise
    except Exception:
        exc_info = traceback.format_exc()
    finally:
        # Restore stdout
        sys.stdout = old_stdout
        captured = buf.getvalue()
        if exc_info:
            captured = (captured + "\n" + str(exc_info)).strip()

        # Print to real stdout so docker logs still show output
        if captured:
            print(captured)

        finished_at = datetime.now(timezone.utc).replace(tzinfo=None)
        duration = (finished_at - started_at).total_seconds()

        # 3. Update the entry with results
        if run_id:
            try:
                db = _SessionFactory()
                run = db.query(ScriptRun).get(run_id)
                if run:
                    run.finished_at = finished_at
                    run.duration_seconds = round(duration, 2)
                    run.success = success
                    run.output = captured or None
                db.commit()
                db.close()
            except Exception as e:
                print(f"[log_run] Failed to update run in DB: {e}", file=sys.stderr)
        else:
            # Fallback if pre-save failed
            try:
                db = _SessionFactory()
                run = ScriptRun(
                    macro_name=macro_name,
                    started_at=started_at,
                    finished_at=finished_at,
                    duration_seconds=round(duration, 2),
                    success=success,
                    output=captured or None,
                )
                db.add(run)
                db.commit()
                db.close()
            except Exception as e:
                print(f"[log_run] Failed to save fallback run to DB: {e}", file=sys.stderr)

    if exc_info and not isinstance(exc_info, str):
        raise RuntimeError(f"Macro '{macro_name}' failed — see output for details.")

def mark_current_runs_as_reset():
    """Marks all 'Running' (success=None) tasks as failed/reset."""
    try:
        db = _SessionFactory()
        db.query(ScriptRun).filter(ScriptRun.success == None).update({
            "success": False,
            "output": ScriptRun.output + "\n[RESET] Task killed by user/agent reset." if ScriptRun.output else "[RESET] Task killed by user/agent reset.",
            "finished_at": datetime.now(timezone.utc).replace(tzinfo=None)
        }, synchronize_session=False)
        db.commit()
        db.close()
    except Exception as e:
        print(f"[mark_current_runs_as_reset] Failed: {e}", file=sys.stderr)
