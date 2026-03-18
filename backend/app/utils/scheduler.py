import json
import os
import asyncio
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload
import redis.asyncio as aioredis

from ..database import engine
from ..models import MacroSchedule, Macro, Command

scheduler = AsyncIOScheduler()

async def execute_macro_task(schedule_id: int):
    """Task executed by the scheduler to trigger a macro."""
    with Session(engine) as session:
        schedule = session.scalars(
            select(MacroSchedule)
            .where(MacroSchedule.id == schedule_id)
            .options(selectinload(MacroSchedule.macro).selectinload(Macro.commands))
        ).first()

        if not schedule or not schedule.enabled:
            return

        macro = schedule.macro
        selected_args = json.loads(schedule.args) if schedule.args else {}
        
        redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
        r = aioredis.from_url(redis_url)
        
        try:
            for cmd in sorted(macro.commands, key=lambda c: c.ord):
                cmd_text = cmd.command
                
                # Append selected arguments if any
                if selected_args:
                    # In scheduler case, we expect args to be command_id -> list of arg_values or similar
                    # For simplicity, if stored as command_id -> list of arg_ids, we'd need to fetch them
                    # But the description says "automatically converted to cron expressions", 
                    # let's assume args is stored as a list of strings to append for now or handle appropriately.
                    pass
                
                payload_data = json.dumps({
                    "command": cmd_text.strip(),
                    "macro_name": macro.name
                })
                await r.publish("agent_commands", payload_data)
        finally:
            await r.aclose()

def add_schedule_to_scheduler(schedule: MacroSchedule):
    """Adds or updates a job in the scheduler for a given MacroSchedule."""
    job_id = f"macro_schedule_{schedule.id}"
    
    # Remove existing job if any
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
    
    if schedule.enabled:
        scheduler.add_job(
            execute_macro_task,
            CronTrigger.from_crontab(schedule.cron_expression),
            args=[schedule.id],
            id=job_id,
            replace_existing=True
        )

def remove_schedule_from_scheduler(schedule_id: int):
    """Removes a job from the scheduler."""
    job_id = f"macro_schedule_{schedule_id}"
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)

def start_scheduler():
    """Starts the scheduler and loads all enabled jobs from the database."""
    if not scheduler.running:
        scheduler.start()
        
    with Session(engine) as session:
        enabled_schedules = session.scalars(
            select(MacroSchedule).where(MacroSchedule.enabled == True)
        ).all()
        
        for schedule in enabled_schedules:
            add_schedule_to_scheduler(schedule)

def shutdown_scheduler():
    """Stops the scheduler."""
    if scheduler.running:
        scheduler.shutdown()
