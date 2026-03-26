import os
import time
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session

DATABASE_URL = os.environ["DATABASE_URL"]

# Engine for PostgreSQL
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def wait_for_db(max_retries=10, delay=2):
    """Wait for the database to become available."""
    print("Connecting to database...")
    retries = 0
    while retries < max_retries:
        try:
            # Try to connect and execute a simple query
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            print("Successfully connected to the database!")
            return True
        except Exception as e:
            retries += 1
            print(f"Database not ready (retry {retries}/{max_retries}): {e}")
            time.sleep(delay)
    
    print("Could not connect to the database after several retries.")
    return False
