from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload
from typing import List

from ..database import get_session
from ..models import MacroGroup, Macro
from ..schemas import MacroGroupCreate, MacroGroupRead, MacroGroupUpdate

router = APIRouter(
    prefix="/macro-groups",
    tags=["macro-groups"],
)

@router.post("", response_model=MacroGroupRead)
def create_macro_group(payload: MacroGroupCreate, session: Session = Depends(get_session)):
    macro_group = MacroGroup(**payload.model_dump())
    session.add(macro_group)
    session.commit()
    session.refresh(macro_group)
    return macro_group

@router.get("", response_model=List[MacroGroupRead])
def get_macro_groups(session: Session = Depends(get_session)):
    return session.scalars(
        select(MacroGroup).options(
            selectinload(MacroGroup.macros).selectinload(Macro.commands)
        ).order_by(MacroGroup.ord)
    ).all()

@router.get("/{id}", response_model=MacroGroupRead)
def get_macro_group(id: int, session: Session = Depends(get_session)):
    macro_group = session.get(MacroGroup, id)
    if not macro_group:
        raise HTTPException(status_code=404, detail="MacroGroup not found")
    return macro_group

@router.patch("/{id}", response_model=MacroGroupRead)
def update_macro_group(id: int, payload: MacroGroupUpdate, session: Session = Depends(get_session)):
    macro_group = session.get(MacroGroup, id)
    if not macro_group:
        raise HTTPException(status_code=404, detail="MacroGroup not found")
    
    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(macro_group, key, value)
    
    session.commit()
    session.refresh(macro_group)
    return macro_group

@router.delete("/{id}")
def delete_macro_group(id: int, session: Session = Depends(get_session)):
    macro_group = session.get(MacroGroup, id)
    if not macro_group:
        raise HTTPException(status_code=404, detail="MacroGroup not found")
    session.delete(macro_group)
    session.commit()
    return {"message": "MacroGroup deleted"}
