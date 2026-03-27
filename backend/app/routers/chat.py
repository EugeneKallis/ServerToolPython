from datetime import datetime, timezone
from io import BytesIO
from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..database import get_session
from ..models import ChatConversation, ChatMessage
from ..schemas import (
    ChatConversationCreate,
    ChatConversationRead,
    ChatConversationUpdate,
    ChatMessageCreate,
    ChatMessageRead,
)

router = APIRouter(prefix="/chat", tags=["chat"])


def _now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


@router.get("/conversations", response_model=List[ChatConversationRead])
def list_conversations(db: Session = Depends(get_session)):
    return db.query(ChatConversation).order_by(ChatConversation.updated_at.desc()).all()


@router.post("/conversations", response_model=ChatConversationRead)
def create_conversation(body: ChatConversationCreate, db: Session = Depends(get_session)):
    now = _now()
    conv = ChatConversation(title=body.title, model=body.model, created_at=now, updated_at=now)
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return conv


@router.get("/conversations/{id}", response_model=ChatConversationRead)
def get_conversation(id: int, db: Session = Depends(get_session)):
    conv = db.query(ChatConversation).filter(ChatConversation.id == id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv


@router.patch("/conversations/{id}", response_model=ChatConversationRead)
def update_conversation(id: int, body: ChatConversationUpdate, db: Session = Depends(get_session)):
    conv = db.query(ChatConversation).filter(ChatConversation.id == id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if body.title is not None:
        conv.title = body.title
    conv.updated_at = _now()
    db.commit()
    db.refresh(conv)
    return conv


@router.delete("/conversations/{id}", status_code=204)
def delete_conversation(id: int, db: Session = Depends(get_session)):
    conv = db.query(ChatConversation).filter(ChatConversation.id == id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    db.delete(conv)
    db.commit()


@router.post("/conversations/{id}/messages", response_model=ChatMessageRead)
def add_message(id: int, body: ChatMessageCreate, db: Session = Depends(get_session)):
    conv = db.query(ChatConversation).filter(ChatConversation.id == id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    now = _now()
    msg = ChatMessage(conversation_id=id, role=body.role, content=body.content, created_at=now)
    db.add(msg)
    conv.updated_at = now
    db.commit()
    db.refresh(msg)
    return msg


@router.post("/extract-pdf")
async def extract_pdf(file: UploadFile = File(...)):
    """Extract text content from an uploaded PDF file."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="File must be a PDF")
    try:
        from pypdf import PdfReader
        data = await file.read()
        reader = PdfReader(BytesIO(data))
        pages = []
        for i, page in enumerate(reader.pages, 1):
            text = page.extract_text() or ""
            if text.strip():
                pages.append(f"[Page {i}]\n{text.strip()}")
        extracted = "\n\n".join(pages)
        if not extracted.strip():
            raise HTTPException(status_code=422, detail="No text could be extracted from this PDF (it may be scanned/image-only)")
        return {"text": extracted, "pages": len(reader.pages)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to extract PDF text: {str(e)}")
