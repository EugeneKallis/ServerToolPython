from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from typing import List

from ..database import get_session
from ..models import Command
from ..schemas import CommandCreate, CommandRead, CommandUpdate

router = APIRouter(
    prefix="/commands",
    tags=["commands"],
)

# Create a new command
@router.post("", response_model=CommandRead)
def create_command(payload: CommandCreate, session: Session = Depends(get_session)):
    command = Command(**payload.model_dump())
    session.add(command)
    session.commit()
    session.refresh(command)
    return command

# Get a command by id
@router.get("/{id}", response_model=CommandRead)
def get_command(id: int, session: Session = Depends(get_session)):
    command = session.get(Command, id)
    if not command:
        raise HTTPException(status_code=404, detail="Command not found")
    return command

@router.get("", response_model=List[CommandRead])
def get_commands(session: Session = Depends(get_session)):
    return session.scalars(select(Command).order_by(Command.ord)).all()

@router.patch("/{id}", response_model=CommandRead)
def update_command(id: int, payload: CommandUpdate, session: Session = Depends(get_session)):
    command = session.get(Command, id)
    if not command:
        raise HTTPException(status_code=404, detail="Command not found")
    
    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(command, key, value)
    
    session.commit()
    session.refresh(command)
    return command

@router.delete("/{id}", response_model=CommandRead)
def delete_command(id:int, session : Session = Depends(get_session)):
    command = session.get(Command, id)
    if not command: 
        raise HTTPException(status_code=404, detail="Command not found")
    session.delete(command)
    session.commit()
    return command