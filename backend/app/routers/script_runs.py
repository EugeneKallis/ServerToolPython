from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from ..database import get_session
from ..models import ScriptRun
from ..schemas import ScriptRunRead

router = APIRouter(prefix="/script-runs", tags=["script-runs"])


@router.get("", response_model=List[ScriptRunRead])
@router.get("/", response_model=List[ScriptRunRead])
def list_script_runs(
    macro: Optional[str] = Query(None, description="Filter by macro name"),
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_session),
):
    q = db.query(ScriptRun).order_by(ScriptRun.started_at.desc())
    if macro:
        q = q.filter(ScriptRun.macro_name == macro)
    return q.offset(offset).limit(limit).all()


@router.get("/{run_id}", response_model=ScriptRunRead)
def get_script_run(run_id: int, db: Session = Depends(get_session)):
    from fastapi import HTTPException
    run = db.query(ScriptRun).filter(ScriptRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found.")
    return run
