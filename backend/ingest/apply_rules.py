"""Apply MerchantAlias normalization + CategoryRule mapping to transaction rows.

All matching runs against the RAW bank description (case-insensitive
substring), so display cleanup can never hide a merchant from the rules.
Rules additionally match the canonical alias name, so a rule can target
either bank-speak ("TST* CORNER CAFE") or a canonical merchant ("Amazon").

Precedence: rules are tried in (priority asc, pattern length desc) order —
explicit priority wins, and at equal priority the most specific pattern wins
("AMAZON PRIME" beats "AMAZON"). Aliases are tried longest-pattern-first.

The displayed description is the alias's canonical name when one matches,
otherwise the raw text with trailing reference numbers stripped.

Two public entry points:

- normalize_rows(rows, db): mutates in-memory dicts before insert.
- reapply_all(db): updates existing Transaction rows in DB, respecting user_overridden.
"""
from __future__ import annotations

import re
from typing import Any

from sqlalchemy.orm import Session

from db.models import CategoryRule, MerchantAlias, Transaction


def load_aliases(db: Session) -> list[tuple[str, str]]:
    """(pattern_lower, canonical_name), longest pattern first."""
    aliases = db.query(MerchantAlias).all()
    aliases.sort(key=lambda a: -len(a.pattern))
    return [(a.pattern.lower(), a.canonical_name) for a in aliases]


def load_rules(db: Session) -> list[tuple[str, str]]:
    """(pattern_lower, category), by priority asc then longest pattern first."""
    rules = db.query(CategoryRule).filter(CategoryRule.active.is_(True)).all()
    rules.sort(key=lambda r: (r.priority, -len(r.merchant_pattern)))
    return [(r.merchant_pattern.lower(), r.category) for r in rules]


def find_alias(raw_low: str, aliases: list[tuple[str, str]]) -> str | None:
    for pattern, canonical in aliases:
        if pattern in raw_low:
            return canonical
    return None


def find_rule(raw_low: str, display_low: str,
              rules: list[tuple[str, str]]) -> str | None:
    for pattern, category in rules:
        if pattern in raw_low or pattern in display_low:
            return category
    return None


# Junk tokens in bank descriptions. Mid-string: store numbers ("#512"),
# phone numbers ("617-250-1100"), reference runs — tokens of digits and
# punctuation only, so digits inside a merchant name ("7-Eleven")
# survive. Trailing: additionally state+ref blobs ("MA0002305843021249…")
# and short numbers ("02144").
_MID_JUNK = re.compile(r"(?<=\s)(?:#\d+|[\d*\-/.#]{4,})(?=\s|$)")
_TRAILING_JUNK = re.compile(r"\s+(?:[A-Za-z]{1,3}\d{4,}\S*|#?\d+)$")


def clean_for_display(raw: str) -> str:
    collapsed = re.sub(r"\s+", " ", str(raw)).strip()
    s = _MID_JUNK.sub("", collapsed)
    s = re.sub(r"\s{2,}", " ", s).strip()
    while True:
        trimmed = _TRAILING_JUNK.sub("", s)
        if trimmed == s:
            break
        s = trimmed
    # All-digit descriptions (e.g. bare check numbers) clean to nothing —
    # fall back to the collapsed raw rather than an empty display.
    return s.rstrip(" -–*").strip() or collapsed


def normalize_one(description_raw: str, current_category: str,
                  aliases: list[tuple[str, str]],
                  rules: list[tuple[str, str]]) -> tuple[str, str]:
    """Compute (display description, category) for one transaction.

    Falls back to current_category (the bank-provided category) when no
    rule matches.
    """
    raw_low = str(description_raw).lower()

    display = find_alias(raw_low, aliases)
    if display is None:
        display = clean_for_display(description_raw)

    category = find_rule(raw_low, display.lower(), rules)
    return display, category if category is not None else current_category


def normalize_rows(rows: list[dict[str, Any]], db: Session) -> None:
    """Mutate dict rows in place: compute description + category from raw."""
    aliases = load_aliases(db)
    rules = load_rules(db)
    for r in rows:
        r["description"], r["category"] = normalize_one(
            r["description_raw"], r["category"], aliases, rules)


def reapply_all(db: Session) -> dict[str, int]:
    """Re-apply alias + rules to all DB rows. Skips user_overridden rows."""
    aliases = load_aliases(db)
    rules = load_rules(db)
    updated = 0
    examined = 0
    for txn in db.query(Transaction).filter(Transaction.user_overridden.is_(False)).all():
        examined += 1
        new_desc, new_cat = normalize_one(txn.description_raw, txn.category,
                                          aliases, rules)
        if new_desc != txn.description or new_cat != txn.category:
            txn.description = new_desc
            txn.category = new_cat
            updated += 1
    db.commit()
    return {"examined": examined, "updated": updated}
