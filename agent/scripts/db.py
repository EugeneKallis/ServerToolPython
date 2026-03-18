"""
db.py — Shared database helpers for agent scripts.

Usage in any script:
    from db import get_session, ArrInstance
    with get_session() as db:
        instances = db.query(ArrInstance).filter(ArrInstance.enabled == True).all()
"""

import os
from contextlib import contextmanager

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
