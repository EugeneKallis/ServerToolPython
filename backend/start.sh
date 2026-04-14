#!/bin/bash
set -e

python -c "
import os
import sqlalchemy as sa
from alembic import command
from alembic.config import Config

pg_host = os.environ.get("POSTGRES_HOST")
pg_port = os.environ.get("POSTGRES_PORT")
pg_user = os.environ.get("POSTGRES_USER")
pg_password = os.environ.get("POSTGRES_PASSWORD")
pg_db = os.environ.get("POSTGRES_DB")
DATABASE_URL = f"postgresql://{pg_user}:{pg_password}@{pg_host}:{pg_port}/{pg_db}"

engine = sa.create_engine(DATABASE_URL)
lock_id = 1234567  # Arbitrary unique lock ID per app

with engine.connect() as conn:
    conn.execute(sa.text('SELECT pg_advisory_lock(:lock_id)'))
    conn.commit()
    try:
        command.upgrade(Config('alembic.ini'), 'head')
    finally:
        conn.execute(sa.text('SELECT pg_advisory_unlock(:lock_id)'))
        conn.commit()
"

echo "Starting uvicorn..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8080
