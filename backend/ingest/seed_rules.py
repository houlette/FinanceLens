"""Seed CategoryRule + MerchantAlias tables on first boot.

Seeds come from data/seed_rules.local.json when it exists (gitignored — your
personal rules, exportable from the DB), otherwise from the small generic
samples below. Seeding only runs when the tables are empty, so an existing
database is never touched.
"""
import json
from pathlib import Path

from sqlalchemy.orm import Session
from db.models import CategoryRule, MerchantAlias


LOCAL_SEED_PATH = Path(__file__).resolve().parents[2] / "data" / "seed_rules.local.json"


# Generic starter aliases: normalize varied bank descriptions to one name.
SAMPLE_MERCHANT_ALIASES = [
    {"pattern": "AMZN", "canonical_name": "Amazon"},
    {"pattern": "Amazon", "canonical_name": "Amazon"},
    {"pattern": "WHOLEFDS", "canonical_name": "Whole Foods"},
    {"pattern": "Netflix.com", "canonical_name": "Netflix"},
]


# Generic starter rules: merchant substring -> category, case-insensitive.
SAMPLE_CATEGORY_RULES = {
    "NETFLIX": "Entertainment",
    "SPOTIFY": "Entertainment",
    "STARBUCKS": "Coffee Shops",
    "DUNKIN": "Coffee Shops",
    "TRADER JOE": "Groceries",
    "WHOLE FOODS": "Groceries",
    "CVS": "Health Care",
    "WALGREENS": "Health Care",
    "SHELL OIL": "Gas/Automotive",
    "LYFT": "Transit",
    "UBER TRIP": "Transit",
    "COMCAST": "Utilities",
}


# Built-in normalization at the category level (vendor-specific labels -> canonical category)
CATEGORY_REMAP = {
    "Car Rental": "Transit",
    "Credit Card Payments": "Transfers",
    "Department Stores": "Merchandise",
    "Lodging": "Travel",
    "Medical Services": "Health Care",
    "Online Services": "Internet",
    "Other Services": "Services",
    "Other Travel": "Travel",
    "Payments and Credits": "Payment/Credit",
    "Phone/Cable": "Utilities",
    "Professional Services": "Services",
    "Restaurants": "Dining",
    "Securities Trades": "Savings",
    "Supermarkets": "Groceries",
    "Travel/ Entertainment": "Travel",
}


def _load_seed_data() -> tuple[list[dict], list[dict]]:
    """(rules, aliases) from the local JSON if present, else the samples."""
    if LOCAL_SEED_PATH.exists():
        with open(LOCAL_SEED_PATH) as f:
            data = json.load(f)
        return data.get("category_rules", []), data.get("merchant_aliases", [])
    rules = [{"merchant_pattern": p, "category": c, "priority": 100, "active": True}
             for p, c in SAMPLE_CATEGORY_RULES.items()]
    return rules, list(SAMPLE_MERCHANT_ALIASES)


def seed_if_empty(db: Session) -> dict:
    """Populate CategoryRule and MerchantAlias tables on first boot.

    Idempotent: only inserts when the table is empty.
    """
    rules, aliases = _load_seed_data()
    added_rules = 0
    added_aliases = 0

    if db.query(CategoryRule).count() == 0:
        for r in rules:
            db.add(CategoryRule(**r))
            added_rules += 1

    if db.query(MerchantAlias).count() == 0:
        for a in aliases:
            db.add(MerchantAlias(**a))
            added_aliases += 1

    db.commit()
    return {"rules_added": added_rules, "aliases_added": added_aliases}
