from collections import Counter
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from db.database import get_db
from db.models import CategoryRule, MerchantAlias, Transaction
from ingest.apply_rules import find_rule, load_rules, reapply_all

router = APIRouter(prefix="/api/rules", tags=["rules"])


# ─── Category rules ──────────────────────────────────────────────────────────

class CategoryRuleOut(BaseModel):
    id: int
    merchant_pattern: str
    category: str
    priority: int
    active: bool

    class Config:
        from_attributes = True


class CategoryRuleIn(BaseModel):
    merchant_pattern: str
    category: str
    priority: int = 100
    active: bool = True


class CategoryRulePatch(BaseModel):
    merchant_pattern: Optional[str] = None
    category: Optional[str] = None
    priority: Optional[int] = None
    active: Optional[bool] = None


@router.get("/categories", response_model=list[CategoryRuleOut])
def list_rules(db: Session = Depends(get_db)):
    return db.query(CategoryRule).order_by(CategoryRule.merchant_pattern).all()


@router.post("/categories", response_model=CategoryRuleOut)
def create_rule(rule: CategoryRuleIn, db: Session = Depends(get_db)):
    r = CategoryRule(**rule.model_dump())
    db.add(r)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Rule with this merchant_pattern already exists")
    db.refresh(r)
    return r


@router.patch("/categories/{rule_id}", response_model=CategoryRuleOut)
def update_rule(rule_id: int, patch: CategoryRulePatch, db: Session = Depends(get_db)):
    r = db.get(CategoryRule, rule_id)
    if not r:
        raise HTTPException(404, "Rule not found")
    for k, v in patch.model_dump(exclude_unset=True).items():
        setattr(r, k, v)
    db.commit()
    db.refresh(r)
    return r


@router.delete("/categories/{rule_id}")
def delete_rule(rule_id: int, db: Session = Depends(get_db)):
    r = db.get(CategoryRule, rule_id)
    if not r:
        raise HTTPException(404, "Rule not found")
    db.delete(r)
    db.commit()
    return {"deleted": rule_id}


# ─── Merchant aliases ────────────────────────────────────────────────────────

class AliasOut(BaseModel):
    id: int
    pattern: str
    canonical_name: str

    class Config:
        from_attributes = True


class AliasIn(BaseModel):
    pattern: str
    canonical_name: str


@router.get("/aliases", response_model=list[AliasOut])
def list_aliases(db: Session = Depends(get_db)):
    return db.query(MerchantAlias).order_by(MerchantAlias.pattern).all()


@router.post("/aliases", response_model=AliasOut)
def create_alias(alias: AliasIn, db: Session = Depends(get_db)):
    a = MerchantAlias(**alias.model_dump())
    db.add(a)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Alias with this pattern already exists")
    db.refresh(a)
    return a


@router.delete("/aliases/{alias_id}")
def delete_alias(alias_id: int, db: Session = Depends(get_db)):
    a = db.get(MerchantAlias, alias_id)
    if not a:
        raise HTTPException(404, "Alias not found")
    db.delete(a)
    db.commit()
    return {"deleted": alias_id}


# ─── Re-apply ─────────────────────────────────────────────────────────────────

@router.post("/reapply")
def reapply(db: Session = Depends(get_db)):
    return reapply_all(db)


# ─── Triage: merchants with no rule ──────────────────────────────────────────

class RuleSuggestionOut(BaseModel):
    description: str
    count: int
    total_spend: float
    current_category: str
    last_date: date


@router.get("/suggestions", response_model=list[RuleSuggestionOut])
def rule_suggestions(db: Session = Depends(get_db)):
    """Transactions matched by no active rule, grouped by display description.

    These rows ride on the bank-provided category. current_category is the
    most common existing category in the group — a default for the new rule.
    Sorted by count desc, then spend desc.
    """
    rules = load_rules(db)
    groups: dict[str, dict] = {}
    for t in db.query(Transaction).filter(Transaction.user_overridden.is_(False)).all():
        raw_low = (t.description_raw or "").lower()
        if find_rule(raw_low, (t.description or "").lower(), rules) is not None:
            continue
        key = t.description or t.description_raw or "(no description)"
        g = groups.get(key)
        if g is None:
            g = groups[key] = {"count": 0, "spend": 0.0, "cats": Counter(), "last": t.date}
        g["count"] += 1
        if t.amount > 0:
            g["spend"] += t.amount
        g["cats"][t.category] += 1
        if t.date > g["last"]:
            g["last"] = t.date

    out = [
        RuleSuggestionOut(
            description=k,
            count=g["count"],
            total_spend=round(g["spend"], 2),
            current_category=g["cats"].most_common(1)[0][0],
            last_date=g["last"],
        )
        for k, g in groups.items()
    ]
    out.sort(key=lambda s: (-s.count, -s.total_spend))
    return out
