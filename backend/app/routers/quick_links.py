from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_session
from ..models import QuickLink
from ..schemas import QuickLinkCreate, QuickLinkUpdate, QuickLinkRead

router = APIRouter(prefix="/quick-links", tags=["quick-links"])


@router.get("", response_model=List[QuickLinkRead])
def list_quick_links(db: Session = Depends(get_session)):
    return db.query(QuickLink).order_by(QuickLink.ord, QuickLink.id).all()


@router.post("", response_model=QuickLinkRead)
def create_quick_link(body: QuickLinkCreate, db: Session = Depends(get_session)):
    link = QuickLink(label=body.label, url=body.url, ord=body.ord)
    db.add(link)
    db.commit()
    db.refresh(link)
    return link


@router.patch("/{id}", response_model=QuickLinkRead)
def update_quick_link(id: int, body: QuickLinkUpdate, db: Session = Depends(get_session)):
    link = db.query(QuickLink).filter(QuickLink.id == id).first()
    if not link:
        raise HTTPException(status_code=404, detail="Quick link not found")
    if body.label is not None:
        link.label = body.label
    if body.url is not None:
        link.url = body.url
    if body.ord is not None:
        link.ord = body.ord
    db.commit()
    db.refresh(link)
    return link


@router.delete("/{id}", status_code=204)
def delete_quick_link(id: int, db: Session = Depends(get_session)):
    link = db.query(QuickLink).filter(QuickLink.id == id).first()
    if not link:
        raise HTTPException(status_code=404, detail="Quick link not found")
    db.delete(link)
    db.commit()
