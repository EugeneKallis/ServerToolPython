from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
import json
import os
import asyncio
import redis.asyncio as aioredis

from ..database import get_session
from ..models import ArrInstance
from ..schemas import ArrInstanceCreate, ArrInstanceUpdate, ArrInstanceRead
from app.utils.arr_config import broadcast_arr_config

router = APIRouter(prefix="/arr-instances", tags=["arr-instances"])


@router.get("/", response_model=List[ArrInstanceRead])
def list_arr_instances(db: Session = Depends(get_session)):
    return db.query(ArrInstance).all()


@router.post("/", response_model=ArrInstanceRead, status_code=201)
async def create_arr_instance(payload: ArrInstanceCreate, db: Session = Depends(get_session)):
    existing = db.query(ArrInstance).filter(ArrInstance.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Instance '{payload.name}' already exists.")
    instance = ArrInstance(**payload.model_dump())
    db.add(instance)
    db.commit()
    db.refresh(instance)
    
    # Broadcast to microservices
    redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
    r = aioredis.from_url(redis_url)
    try:
        await broadcast_arr_config(r, db)
    finally:
        await r.close()
    
    return instance


@router.put("/{instance_id}", response_model=ArrInstanceRead)
async def update_arr_instance(instance_id: int, payload: ArrInstanceUpdate, db: Session = Depends(get_session)):
    instance = db.query(ArrInstance).filter(ArrInstance.id == instance_id).first()
    if not instance:
        raise HTTPException(status_code=404, detail="Instance not found.")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(instance, field, value)
    db.commit()
    db.refresh(instance)

    # Broadcast to microservices
    redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
    r = aioredis.from_url(redis_url)
    try:
        await broadcast_arr_config(r, db)
    finally:
        await r.close()

    return instance


@router.delete("/{instance_id}", status_code=204)
async def delete_arr_instance(instance_id: int, db: Session = Depends(get_session)):
    instance = db.query(ArrInstance).filter(ArrInstance.id == instance_id).first()
    if not instance:
        raise HTTPException(status_code=404, detail="Instance not found.")
    db.delete(instance)
    db.commit()

    # Broadcast to microservices
    redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
    r = aioredis.from_url(redis_url)
    try:
        await broadcast_arr_config(r, db)
    finally:
        await r.close()

@router.post("/search_all", status_code=202)
async def trigger_search_all():
    redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
    r = aioredis.from_url(redis_url)
    try:
        await r.lpush("arr_commands", json.dumps({"type": "search_all"}))
    finally:
        await r.close()
    return {"message": "Search all triggered."}

@router.post("/{instance_id}/search", status_code=202)
async def trigger_search_instance(instance_id: int):
    redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
    r = aioredis.from_url(redis_url)
    try:
        await r.lpush("arr_commands", json.dumps({"type": "search_instance", "instance_id": instance_id}))
    finally:
        await r.close()
    return {"message": f"Search triggered for instance {instance_id}."}
