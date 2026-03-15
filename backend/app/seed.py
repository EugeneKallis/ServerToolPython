from sqlalchemy.orm import Session
from app.database import SessionLocal, engine
from app.models import Base, MacroGroup, Macro, Command

def seed_data():
    db = SessionLocal()
    try:
        # Clear existing data to avoid duplicates in this test env
        print("Clearing existing data...")
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)

        print("Seeding database...")
        
        # Create Macro Groups
        group1 = MacroGroup(name="System Utilities", ord=1)
        group2 = MacroGroup(name="Development Tools", ord=2)
        
        db.add_all([group1, group2])
        db.commit()
        db.refresh(group1)
        db.refresh(group2)

        # Create Macros for Group 1
        macro1 = Macro(name="Check Disk Space", ord=1, macro_group_id=group1.id)
        macro2 = Macro(name="Memory Usage", ord=2, macro_group_id=group1.id)
        
        # Create Macros for Group 2
        macro3 = Macro(name="Start Dev Server", ord=1, macro_group_id=group2.id)
        
        db.add_all([macro1, macro2, macro3])
        db.commit()
        db.refresh(macro1)
        db.refresh(macro2)
        db.refresh(macro3)

        # Create Commands for Macro 1
        cmd1 = Command(name="Root Usage", ord=1, command='df -h /', macro_id=macro1.id)
        cmd2 = Command(name="Home Usage", ord=2, command='df -h /home', macro_id=macro1.id)
        
        # Create Commands for Macro 2
        cmd3 = Command(name="Free Mem", ord=1, command='free -m', macro_id=macro2.id)
        
        # Create Commands for Macro 3
        cmd4 = Command(name="Hello World", ord=1, command='echo "hello world"', macro_id=macro3.id)
        
        db.add_all([cmd1, cmd2, cmd3, cmd4])
        db.commit()

        print("Database seeded successfully!")
    except Exception as e:
        print(f"Error seeding database: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_data()
