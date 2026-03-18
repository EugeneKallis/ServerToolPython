from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from typing import List

from ..database import get_session
from ..models import MacroSchedule
from ..schemas import MacroScheduleCreate, MacroScheduleRead
from ..utils.scheduler import add_schedule_to_scheduler, remove_schedule_from_scheduler

router = APIRouter(
    prefix="/schedules",
    tags=["schedules"],
)

@router.post("", response_model=MacroScheduleRead)
def create_schedule(payload: MacroScheduleCreate, session: Session = Depends(get_session)):
    schedule = MacroSchedule(**payload.model_dump())
    session.add(schedule)
    session.commit()
    session.refresh(schedule)
    
    if schedule.enabled:
        add_schedule_to_scheduler(schedule)
        
    return schedule

@router.get("", response_model=List[MacroScheduleRead])
def get_schedules(session: Session = Depends(get_session)):
    return session.scalars(select(MacroSchedule)).all()

@router.get("/{id}", response_model=MacroScheduleRead)
def get_schedule(id: int, session: Session = Depends(get_session)):
    schedule = session.get(MacroSchedule, id)
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return schedule

@router.patch("/{id}", response_model=MacroScheduleRead)
def update_schedule(id: int, payload: dict, session: Session = Depends(get_session)):
    schedule = session.get(MacroSchedule, id)
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    
    for key, value in payload.items():
        setattr(schedule, key, value)
    
    session.commit()
    session.refresh(schedule)
    
    if schedule.enabled:
        add_schedule_to_scheduler(schedule)
    else:
        remove_schedule_from_scheduler(schedule.id)
        
    return schedule

@router.delete("/{id}")
def delete_schedule(id: int, session: Session = Depends(get_session)):
    schedule = session.get(MacroSchedule, id)
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    
    remove_schedule_from_scheduler(id)
    session.delete(schedule)
    session.commit()
    return {"message": "Schedule deleted"}
