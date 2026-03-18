from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from ..database import get_session
from ..models import ArrInstance
from ..schemas import ArrInstanceCreate, ArrInstanceUpdate, ArrInstanceRead

router = APIRouter(prefix="/arr-instances", tags=["arr-instances"])


@router.get("/", response_model=List[ArrInstanceRead])
@router.get("", response_model=List[ArrInstanceRead])
def list_arr_instances(db: Session = Depends(get_session)):
    return db.query(ArrInstance).all()


@router.post("/", response_model=ArrInstanceRead, status_code=201)
@router.post("", response_model=ArrInstanceRead, status_code=201)
def create_arr_instance(payload: ArrInstanceCreate, db: Session = Depends(get_session)):
    existing = db.query(ArrInstance).filter(ArrInstance.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Instance '{payload.name}' already exists.")
    instance = ArrInstance(**payload.model_dump())
    db.add(instance)
    db.commit()
    db.refresh(instance)
    return instance


@router.put("/{instance_id}", response_model=ArrInstanceRead)
def update_arr_instance(instance_id: int, payload: ArrInstanceUpdate, db: Session = Depends(get_session)):
    instance = db.query(ArrInstance).filter(ArrInstance.id == instance_id).first()
    if not instance:
        raise HTTPException(status_code=404, detail="Instance not found.")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(instance, field, value)
    db.commit()
    db.refresh(instance)
    return instance


@router.delete("/{instance_id}", status_code=204)
def delete_arr_instance(instance_id: int, db: Session = Depends(get_session)):
    instance = db.query(ArrInstance).filter(ArrInstance.id == instance_id).first()
    if not instance:
        raise HTTPException(status_code=404, detail="Instance not found.")
    db.delete(instance)
    db.commit()
