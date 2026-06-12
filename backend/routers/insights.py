"""Insights: MoM deltas, top expenses, Q-over-Q comparison.

Ports the notebook's >$200 month-over-month delta logic and the >$500 high-value
spending list, plus a Q1-vs-Q1-prev-year comparison table.
"""
from datetime import date as Date
from typing import Optional

import pandas as pd
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from db.database import get_db
from db.models import Transaction
from routers.summaries import EXCLUDED_FROM_SPEND

router = APIRouter(prefix="/api/insights", tags=["insights"])

EXCLUDED_FROM_HIGH_VALUE = {"Savings", "Mortgages", "Transfers"}


def _df_for_range(db: Session, start: Optional[Date], end: Optional[Date]) -> pd.DataFrame:
    q = db.query(Transaction.date, Transaction.amount, Transaction.category,
                 Transaction.description, Transaction.id)
    if start:
        q = q.filter(Transaction.date >= start)
    if end:
        q = q.filter(Transaction.date <= end)
    df = pd.DataFrame([{
        "id": t.id, "date": pd.Timestamp(t.date),
        "amount": float(t.amount), "category": t.category, "description": t.description,
    } for t in q.all()])
    return df


@router.get("/mom-deltas")
def mom_deltas(
    threshold: float = Query(200, description="Min absolute MoM change to surface"),
    start: Optional[Date] = None,
    end: Optional[Date] = None,
    db: Session = Depends(get_db),
):
    df = _df_for_range(db, start, end)
    if df.empty:
        return []
    spend = df[df["amount"] > 0]
    spend = spend[~spend["category"].isin(EXCLUDED_FROM_SPEND | {"Savings"})]
    if spend.empty:
        return []

    monthly = spend.groupby([pd.Grouper(key="date", freq="ME"), "category"])["amount"].sum()
    pivot = monthly.unstack(fill_value=0).sort_index()
    delta = pivot.diff().fillna(0)

    out = []
    for idx, row in delta.iterrows():
        month = idx.strftime("%Y-%m")
        for cat, d in row.items():
            if abs(d) < threshold:
                continue
            mask = (
                (spend["date"].dt.to_period("M") == idx.to_period("M"))
                & (spend["category"] == cat)
            )
            top5 = spend[mask].nlargest(5, "amount")[
                ["id", "date", "description", "amount"]
            ]
            out.append({
                "month": month,
                "category": cat,
                "delta": round(float(d), 2),
                "current": round(float(pivot.at[idx, cat]), 2),
                "top_transactions": [
                    {"id": int(r.id), "date": r.date.strftime("%Y-%m-%d"),
                     "description": r.description, "amount": round(float(r.amount), 2)}
                    for r in top5.itertuples()
                ],
            })
    out.sort(key=lambda x: (x["month"], -abs(x["delta"])))
    return out


@router.get("/high-value")
def high_value(
    threshold: float = Query(500),
    start: Optional[Date] = None,
    end: Optional[Date] = None,
    db: Session = Depends(get_db),
):
    df = _df_for_range(db, start, end)
    if df.empty:
        return []
    hv = df[(df["amount"] > threshold) & (~df["category"].isin(EXCLUDED_FROM_HIGH_VALUE))]
    hv = hv.sort_values("amount", ascending=False)
    return [
        {"id": int(r.id), "date": r.date.strftime("%Y-%m-%d"),
         "description": r.description, "category": r.category,
         "amount": round(float(r.amount), 2)}
        for r in hv.itertuples()
    ]


@router.get("/quarter-compare")
def quarter_compare(
    year: int = Query(..., description="Year of the recent quarter"),
    quarter: int = Query(..., ge=1, le=4),
    db: Session = Depends(get_db),
):
    """Compare a given quarter to the same quarter in the prior year."""
    def q_range(y: int, q: int) -> tuple[Date, Date]:
        from datetime import timedelta
        start_month = (q - 1) * 3 + 1
        end_month = start_month + 2
        if end_month == 12:
            end = Date(y, 12, 31)
        else:
            end = Date(y, end_month + 1, 1) - timedelta(days=1)
        return Date(y, start_month, 1), end

    cur_s, cur_e = q_range(year, quarter)
    prv_s, prv_e = q_range(year - 1, quarter)

    df = _df_for_range(db, prv_s, cur_e)
    if df.empty:
        return {"current": {}, "previous": {}, "rows": []}
    spend = df[df["amount"] > 0]
    spend = spend[~spend["category"].isin(EXCLUDED_FROM_SPEND)]

    def agg(s, e):
        m = spend[(spend["date"] >= pd.Timestamp(s)) & (spend["date"] <= pd.Timestamp(e))]
        return m.groupby("category")["amount"].sum().to_dict()

    cur = agg(cur_s, cur_e)
    prv = agg(prv_s, prv_e)
    cats = sorted(set(cur) | set(prv))
    rows = []
    for c in cats:
        a = float(prv.get(c, 0))
        b = float(cur.get(c, 0))
        change = b - a
        pct = (change / a * 100) if a else (float("inf") if b else 0)
        rows.append({
            "category": c,
            "previous": round(a, 2),
            "current": round(b, 2),
            "change": round(change, 2),
            "pct_change": None if pct == float("inf") else round(pct, 2),
        })
    rows.sort(key=lambda r: abs(r["change"]), reverse=True)
    return {
        "current_label": f"{year} Q{quarter}",
        "previous_label": f"{year - 1} Q{quarter}",
        "rows": rows,
    }
