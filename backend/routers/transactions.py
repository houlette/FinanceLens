from datetime import date as Date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db.database import get_db
from db.models import Transaction

router = APIRouter(prefix="/api/transactions", tags=["transactions"])


class TxnOut(BaseModel):
    id: int
    date: Date
    description: str
    description_raw: str
    amount: float
    category: str
    account_number: Optional[str] = None
    check_number: Optional[str] = None
    user_overridden: bool

    class Config:
        from_attributes = True


class TxnPatch(BaseModel):
    category: Optional[str] = None
    description: Optional[str] = None


@router.get("", response_model=list[TxnOut])
def list_transactions(
    start: Optional[Date] = None,
    end: Optional[Date] = None,
    category: Optional[str] = None,
    q: Optional[str] = None,
    min_amount: Optional[float] = None,
    max_amount: Optional[float] = None,
    limit: int = Query(500, le=5000),
    offset: int = 0,
    db: Session = Depends(get_db),
):
    qry = db.query(Transaction)
    if start:
        qry = qry.filter(Transaction.date >= start)
    if end:
        qry = qry.filter(Transaction.date <= end)
    if category:
        qry = qry.filter(Transaction.category == category)
    if q:
        like = f"%{q}%"
        qry = qry.filter(Transaction.description.ilike(like))
    if min_amount is not None:
        qry = qry.filter(Transaction.amount >= min_amount)
    if max_amount is not None:
        qry = qry.filter(Transaction.amount <= max_amount)
    qry = qry.order_by(Transaction.date.desc(), Transaction.id.desc())
    return qry.offset(offset).limit(limit).all()


@router.patch("/{txn_id}", response_model=TxnOut)
def patch_transaction(txn_id: int, patch: TxnPatch, db: Session = Depends(get_db)):
    txn = db.get(Transaction, txn_id)
    if not txn:
        raise HTTPException(404, "Transaction not found")
    changed = False
    if patch.category is not None and patch.category != txn.category:
        txn.category = patch.category
        changed = True
    if patch.description is not None and patch.description != txn.description:
        txn.description = patch.description
        changed = True
    if changed:
        txn.user_overridden = True
        txn.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(txn)
    return txn


@router.get("/categories", response_model=list[str])
def list_categories(db: Session = Depends(get_db)):
    rows = db.query(Transaction.category).distinct().order_by(Transaction.category).all()
    return [r[0] for r in rows]
