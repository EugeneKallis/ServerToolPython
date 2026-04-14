#!/usr/bin/env python3
"""
Database Migration Script

Creates tables in a new PostgreSQL database and copies data from the current database.
Handles foreign key references by remapping IDs based on copied parent records.

Usage:
    python migrate_db.py --source-db "postgresql://user:pass@localhost:5432/olddb" \
                         --target-db "postgresql://user:pass@localhost:5432/newdb"
"""

import argparse
import sys
from sqlalchemy import create_engine, text, inspect as sa_inspect, exc
from sqlalchemy.orm import sessionmaker, Session


TABLE_ORDER = [
    "macro_group",
    "macro",
    "command",
    "command_argument",
    "arr_instance",
    "script_run",
    "shell_history",
    "macro_schedule",
    "scraped_item",
    "scraped_item_file",
    "chat_conversation",
    "chat_message",
    "quick_link",
]

TABLE_ID_MAPPING = {}


def get_table_order() -> list[str]:
    return TABLE_ORDER


def get_fk_columns(engine, table_name: str) -> dict[str, str]:
    """Get foreign key columns and their referenced tables."""
    fk_query = text("""
        SELECT 
            kcu.column_name,
            ccu.table_name AS foreign_table_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
            ON ccu.constraint_name = tc.constraint_name
            AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
            AND tc.table_name = :table_name
            AND tc.table_schema = 'public'
    """)
    with engine.connect() as conn:
        result = conn.execute(fk_query, {"table_name": table_name})
        return {row[0]: row[1] for row in result.fetchall()}


def create_tables(engine):
    """Create all tables in the target database using the models."""
    from backend.app.models import Base

    Base.metadata.create_all(engine)
    print("Tables created successfully.")


def truncate_target_tables(target_engine, exclude_tables: list[str] = None):
    """Truncate all tables in target database (for hard copy)."""
    if exclude_tables is None:
        exclude_tables = []

    tables = [t for t in get_table_order() if t not in exclude_tables]
    if not tables:
        return

    print("Truncating target tables...")
    with target_engine.connect() as conn:
        for table in reversed(tables):
            try:
                conn.execute(text(f"TRUNCATE TABLE {table} CASCADE"))
                print(f"  {table}: truncated")
            except Exception as e:
                print(f"  {table}: error truncating: {e}")
                raise
        conn.commit()


def copy_table_data(
    source_session: Session,
    target_session: Session,
    table_name: str,
    target_engine,
    batch_size: int = 1000,
):
    """Copy all data from source to target for a given table."""
    global TABLE_ID_MAPPING

    source_inspector = sa_inspect(source_session.bind)
    target_inspector = sa_inspect(target_engine)

    try:
        source_columns = [col["name"] for col in source_inspector.get_columns(table_name)]
    except exc.NoSuchTableError:
        print(f"  {table_name}: table does not exist in source, skipping")
        return 0
    except exc.UnsupportedTableError:
        print(f"  {table_name}: table not supported in source, skipping")
        return 0
    id_column = source_inspector.get_pk_constraint(table_name).get(
        "constrained_columns", [None]
    )[0]

    query = text(f"SELECT * FROM {table_name}")
    result = source_session.execute(query)
    rows = result.fetchall()

    if not rows:
        print(f"  {table_name}: no rows to copy")
        return 0

    fk_columns = get_fk_columns(target_engine, table_name)

    id_mapping = {}
    count = 0

    for row in rows:
        row_dict = dict(row._mapping)
        old_id = row_dict.get(id_column)
        row_dict.pop(id_column, None)

        for fk_col, ref_table in fk_columns.items():
            if fk_col in row_dict and ref_table in TABLE_ID_MAPPING:
                old_fk_val = row_dict[fk_col]
                if old_fk_val is not None:
                    row_dict[fk_col] = TABLE_ID_MAPPING[ref_table].get(
                        old_fk_val, old_fk_val
                    )

        columns_to_insert = list(row_dict.keys())
        placeholders = ", ".join([f":{col}" for col in columns_to_insert])
        insert_query = text(
            f"INSERT INTO {table_name} ({', '.join(columns_to_insert)}) VALUES ({placeholders}) RETURNING {id_column}"
        )

        try:
            result = target_session.execute(insert_query, row_dict)
            new_id = result.scalar()
            count += 1

            if old_id is not None and new_id is not None:
                id_mapping[old_id] = new_id

            if count % batch_size == 0:
                target_session.commit()
                print(f"  {table_name}: copied {count} rows...")
        except Exception as e:
            print(f"  {table_name}: error copying row {count + 1}: {e}")
            target_session.rollback()
            raise

    target_session.commit()

    if id_mapping:
        TABLE_ID_MAPPING[table_name] = id_mapping

    print(f"  {table_name}: copied {count} rows")
    return count


def reset_target_sequences(target_engine, tables: list[str]):
    """Reset auto-increment sequences to continue from max id in target."""
    print("Resetting sequences...")
    with target_engine.connect() as conn:
        for table in tables:
            try:
                result = conn.execute(text(f"SELECT MAX(id) FROM {table}"))
                max_id = result.scalar() or 0
                if max_id > 0:
                    conn.execute(
                        text(
                            f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), {max_id}, true)"
                        )
                    )
                    print(f"  {table}: sequence set to {max_id}")
            except Exception as e:
                print(f"  {table}: could not reset sequence: {e}")
        conn.commit()


def run_migration(
    source_url: str,
    target_url: str,
    skip_copy: bool = False,
    only_copy: bool = False,
    exclude_tables: list[str] = None,
    hard_copy: bool = False,
):
    """Run the full migration."""
    global TABLE_ID_MAPPING
    TABLE_ID_MAPPING = {}

    if exclude_tables is None:
        exclude_tables = []

    print(f"Source: {source_url.split('@')[-1] if '@' in source_url else source_url}")
    print(f"Target: {target_url.split('@')[-1] if '@' in target_url else target_url}")
    if exclude_tables:
        print(f"Excluding tables: {', '.join(exclude_tables)}")
    print()

    source_engine = create_engine(source_url)
    target_engine = create_engine(target_url)

    SourceSession = sessionmaker(bind=source_engine)
    TargetSession = sessionmaker(bind=target_engine)

    tables_to_copy = [t for t in get_table_order() if t not in exclude_tables]

    if not only_copy:
        print("=== Step 1: Creating tables ===")
        create_tables(target_engine)
        print()

    if hard_copy and not skip_copy:
        print("=== Step 2: Truncating target tables (hard copy) ===")
        truncate_target_tables(target_engine, exclude_tables)
        print()

    if not skip_copy:
        step_num = 3 if hard_copy else 2
        print(f"=== Step {step_num}: Copying data ===")
        total_rows = 0

        for table in tables_to_copy:
            try:
                source_session = SourceSession()
                target_session = TargetSession()
                count = copy_table_data(
                    source_session, target_session, table, target_engine
                )
                total_rows += count
                source_session.close()
                target_session.close()
            except Exception as e:
                print(f"Error copying table {table}: {e}")
                raise

        print(f"\nTotal rows copied: {total_rows}")
        print()

        seq_step = 4 if hard_copy else 3
        print(f"=== Step {seq_step}: Resetting sequences ===")
        reset_target_sequences(target_engine, tables_to_copy)
        print()

    print("=== Migration complete ===")

    source_engine.dispose()
    target_engine.dispose()


def main():
    parser = argparse.ArgumentParser(
        description="Migrate database to new PostgreSQL instance"
    )
    parser.add_argument("--source-db", help="Source database connection URL")
    parser.add_argument("--target-db", help="Target database connection URL")
    parser.add_argument(
        "--skip-copy",
        action="store_true",
        help="Skip copying data (only create tables)",
    )
    parser.add_argument(
        "--only-copy", action="store_true", help="Only copy data (skip table creation)"
    )
    parser.add_argument(
        "--exclude",
        help="Comma-separated list of tables to skip (e.g., 'scraped_item,scraped_item_file')",
    )
    parser.add_argument(
        "--hard-copy",
        action="store_true",
        help="Truncate target tables before copying (for re-running migration)",
    )

    args = parser.parse_args()

    source_url = args.source_db or input("Source database URL: ").strip()
    target_url = args.target_db or input("Target database URL: ").strip()

    if not source_url or not target_url:
        print("Error: Both source and target database URLs are required")
        sys.exit(1)

    exclude_tables = []
    if args.exclude:
        exclude_tables = [t.strip() for t in args.exclude.split(",") if t.strip()]

    run_migration(
        source_url,
        target_url,
        args.skip_copy,
        args.only_copy,
        exclude_tables,
        args.hard_copy,
    )


if __name__ == "__main__":
    main()
