from datetime import datetime, timezone, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_session
from ..models import ScrapedItem
from ..schemas import ScrapedItemRead

router = APIRouter(prefix="/scraper", tags=["scraper"])


@router.get("/items", response_model=List[ScrapedItemRead])
def list_items(source: Optional[str] = None, session: Session = Depends(get_session)):
    q = select(ScrapedItem).where(ScrapedItem.is_hidden == False)
    if source:
        q = q.where(ScrapedItem.source == source)
    q = q.order_by(ScrapedItem.created_at.desc())
    return session.scalars(q).all()


@router.patch("/items/{id}/hide")
def hide_item(id: int, session: Session = Depends(get_session)):
    item = session.get(ScrapedItem, id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    item.is_hidden = True
    session.commit()
    return {"status": "hidden"}


@router.patch("/items/{id}/downloaded")
def mark_downloaded(id: int, session: Session = Depends(get_session)):
    item = session.get(ScrapedItem, id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    item.is_downloaded = True
    session.commit()
    return {"status": "downloaded"}


@router.post("/items/undo-hide")
def undo_hide(source: str = "141jav", session: Session = Depends(get_session)):
    item = session.scalars(
        select(ScrapedItem)
        .where(ScrapedItem.source == source, ScrapedItem.is_hidden == True)
        .order_by(ScrapedItem.created_at.desc())
        .limit(1)
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="No hidden items to undo")
    item.is_hidden = False
    session.commit()
    return {"status": "restored", "id": item.id}


@router.delete("/items")
def delete_items(source: Optional[str] = None, session: Session = Depends(get_session)):
    q = select(ScrapedItem)
    if source:
        q = q.where(ScrapedItem.source == source)
    items = session.scalars(q).all()
    for item in items:
        session.delete(item)
    session.commit()
    return {"deleted": len(items)}