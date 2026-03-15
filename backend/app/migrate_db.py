import sqlite3
import os
from app.database import SessionLocal, engine
from app.models import Base, MacroGroup, Macro, Command

# Path to the old database (assuming we run from the backend directory)
DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "config.db")

def migrate_database():
    if not os.path.exists(DB_PATH):
        print(f"Error: Could not find old database at {DB_PATH}")
        return
        
    print(f"Connecting to old database at {DB_PATH}...")
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    db = SessionLocal()
    
    try:
        print("Clearing existing data in PostgreSQL database...")
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)

        # 1. Migrate MacroGroups
        print("Migrating MacroGroups...")
        cursor.execute("SELECT id, name, ord FROM macro_groups")
        old_groups = cursor.fetchall()
        
        for row in old_groups:
            group = MacroGroup(
                id=row['id'],
                name=row['name'],
                ord=row['ord']
            )
            db.add(group)
        
        db.commit()
        print(f"Migrated {len(old_groups)} MacroGroups.")

        # 2. Migrate Macros (only those linked to existing MacroGroups)
        print("Migrating Macros...")
        cursor.execute("SELECT m.id, m.name, m.ord, m.group_id FROM macros m INNER JOIN macro_groups mg ON m.group_id = mg.id")
        old_macros = cursor.fetchall()
        
        for row in old_macros:
            macro = Macro(
                id=row['id'],
                name=row['name'],
                ord=row['ord'],
                macro_group_id=row['group_id']
            )
            db.add(macro)
            
        db.commit()
        print(f"Migrated {len(old_macros)} Macros.")

        # 3. Migrate Commands (only those linked to existing Macros)
        print("Migrating Commands...")
        cursor.execute("SELECT c.id, c.macro_id, c.ord, c.cmd FROM commands c INNER JOIN macros m ON c.macro_id = m.id INNER JOIN macro_groups mg ON m.group_id = mg.id")
        old_commands = cursor.fetchall()
        
        for row in old_commands:
            # Generate a name from the command text if it's too long, or just use the text
            cmd_text = row['cmd']
            cmd_name = cmd_text[:50] if cmd_text else "Empty Command"
            
            command = Command(
                id=row['id'],
                name=cmd_name,
                ord=row['ord'],
                command=cmd_text,
                macro_id=row['macro_id']
            )
            db.add(command)
            
        db.commit()
        print(f"Migrated {len(old_commands)} Commands.")

        # If Postgres sequences are out of sync because we inserted explicit IDs, 
        # we need to reset the sequences so new inserts don't fail with duplicate key violations.
        from sqlalchemy import text
        print("Resetting primary key sequences...")
        db.execute(text("SELECT setval(pg_get_serial_sequence('macro_group', 'id'), COALESCE(MAX(id), 1) + 1, false) FROM macro_group;"))
        db.execute(text("SELECT setval(pg_get_serial_sequence('macro', 'id'), COALESCE(MAX(id), 1) + 1, false) FROM macro;"))
        db.execute(text("SELECT setval(pg_get_serial_sequence('command', 'id'), COALESCE(MAX(id), 1) + 1, false) FROM command;"))
        db.commit()

        print("Migration completed successfully!")
        
    except Exception as e:
        print(f"Error during migration: {e}")
        db.rollback()
    finally:
        db.close()
        conn.close()

if __name__ == "__main__":
    migrate_database()
