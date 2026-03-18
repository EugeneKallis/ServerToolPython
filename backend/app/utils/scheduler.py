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

SCHEDULER_TZ = os.getenv("TZ", "America/New_York")
scheduler = AsyncIOScheduler(timezone=SCHEDULER_TZ)

async def execute_macro_task(schedule_id: int):
    """Task executed by the scheduler to trigger a macro."""
    import uuid
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
        
        run_id = str(uuid.uuid4())
        
        try:
            sorted_cmds = sorted(macro.commands, key=lambda c: c.ord)
            for idx, cmd in enumerate(sorted_cmds):
                cmd_text = cmd.command
                is_last = (idx == len(sorted_cmds) - 1)
                
                # Append selected arguments if any
                if selected_args:
                    pass
                
                payload_data = json.dumps({
                    "command": cmd_text.strip(),
                    "macro_name": macro.name,
                    "run_id": run_id,
                    "is_last": is_last
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
            CronTrigger.from_crontab(schedule.cron_expression, timezone=SCHEDULER_TZ),
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
