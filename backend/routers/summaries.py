from datetime import date as Date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, case
from sqlalchemy.orm import Session

from db.database import get_db
from db.models import Transaction

router = APIRouter(prefix="/api/summaries", tags=["summaries"])


# Categories excluded from "spending" reporting (per notebook conventions).
EXCLUDED_FROM_SPEND = {"Transfers", "Debt", "Payment/Credit"}


def _filtered_query(db: Session, start: Optional[Date], end: Optional[Date]):
    q = db.query(Transaction)
    if start:
        q = q.filter(Transaction.date >= start)
    if end:
        q = q.filter(Transaction.date <= end)
    return q


@router.get("/monthly")
def monthly_by_category(
    start: Optional[Date] = None,
    end: Optional[Date] = None,
    exclude_savings: bool = True,
    db: Session = Depends(get_db),
):
    """Stacked monthly: spending by category over time."""
    month = func.strftime("%Y-%m", Transaction.date).label("month")
    q = _filtered_query(db, start, end).with_entities(
        month, Transaction.category, func.sum(Transaction.amount).label("total")
    ).filter(Transaction.amount > 0)
    rows = q.group_by(month, Transaction.category).all()

    excluded = set(EXCLUDED_FROM_SPEND)
    if exclude_savings:
        excluded.add("Savings")

    months: dict[str, dict[str, float]] = {}
    categories: set[str] = set()
    for m, cat, total in rows:
        if cat in excluded:
            continue
        months.setdefault(m, {})[cat] = round(float(total), 2)
        categories.add(cat)

    return {
        "months": sorted(months.keys()),
        "categories": sorted(categories),
        "data": [{"month": m, "values": months[m]} for m in sorted(months.keys())],
    }


@router.get("/income-vs-spend")
def income_vs_spend(
    start: Optional[Date] = None,
    end: Optional[Date] = None,
    db: Session = Depends(get_db),
):
    month = func.strftime("%Y-%m", Transaction.date).label("month")
    spend = func.sum(case((Transaction.amount > 0, Transaction.amount), else_=0)).label("spend")
    income = func.sum(case((Transaction.amount < 0, -Transaction.amount), else_=0)).label("income")
    q = _filtered_query(db, start, end).with_entities(month, spend, income) \
        .filter(~Transaction.category.in_(EXCLUDED_FROM_SPEND)) \
        .group_by(month).order_by(month)
    return [
        {"month": m, "spend": round(float(s or 0), 2), "income": round(float(i or 0), 2)}
        for m, s, i in q.all()
    ]


@router.get("/by-category")
def by_category(
    start: Optional[Date] = None,
    end: Optional[Date] = None,
    exclude_savings: bool = True,
    db: Session = Depends(get_db),
):
    excluded = set(EXCLUDED_FROM_SPEND)
    if exclude_savings:
        excluded.add("Savings")
    q = _filtered_query(db, start, end).with_entities(
        Transaction.category,
        func.sum(Transaction.amount).label("total"),
        func.count(Transaction.id).label("count"),
    ).filter(Transaction.amount > 0) \
     .filter(~Transaction.category.in_(excluded)) \
     .group_by(Transaction.category) \
     .order_by(func.sum(Transaction.amount).desc())
    return [{"category": c, "total": round(float(t), 2), "count": int(n)} for c, t, n in q.all()]


@router.get("/by-merchant")
def by_merchant(
    category: Optional[str] = None,
    start: Optional[Date] = None,
    end: Optional[Date] = None,
    limit: int = Query(50, le=500),
    db: Session = Depends(get_db),
):
    q = _filtered_query(db, start, end).with_entities(
        Transaction.description,
        func.sum(Transaction.amount).label("total"),
        func.count(Transaction.id).label("count"),
    ).filter(Transaction.amount > 0)
    if category:
        q = q.filter(Transaction.category == category)
    q = q.group_by(Transaction.description) \
         .order_by(func.sum(Transaction.amount).desc()).limit(limit)
    return [{"merchant": d, "total": round(float(t), 2), "count": int(n)} for d, t, n in q.all()]


@router.get("/kpis")
def kpis(
    start: Optional[Date] = None,
    end: Optional[Date] = None,
    db: Session = Depends(get_db),
):
    q = _filtered_query(db, start, end)
    spend = q.with_entities(func.sum(Transaction.amount)) \
        .filter(Transaction.amount > 0) \
        .filter(~Transaction.category.in_(EXCLUDED_FROM_SPEND | {"Savings"})) \
        .scalar() or 0
    income = q.with_entities(func.sum(-Transaction.amount)) \
        .filter(Transaction.amount < 0) \
        .filter(~Transaction.category.in_(EXCLUDED_FROM_SPEND)) \
        .scalar() or 0
    savings = q.with_entities(func.sum(Transaction.amount)) \
        .filter(Transaction.amount > 0) \
        .filter(Transaction.category == "Savings") \
        .scalar() or 0
    return {
        "income": round(float(income), 2),
        "spend": round(float(spend), 2),
        "savings": round(float(savings), 2),
        "net": round(float(income) - float(spend) - float(savings), 2),
    }
