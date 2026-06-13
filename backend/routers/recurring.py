"""Recurring transaction detection.

Finds series that repeat on a regular cadence (weekly … yearly). Design
notes — each guards against a way recurring detection commonly goes wrong:

- Detection always runs on the FULL history, never a filtered window;
  otherwise annual renewals and "did this end?" judgments misclassify.
- Grouping is by the canonical display description. A merchant can host both
  a subscription and one-off purchases (Prime Video: a monthly charge plus
  rentals), so when the merchant as a whole isn't periodic we retry on
  amount clusters within it.
- Cadence is judged on dates alone; amount variability only classifies the
  series as fixed vs variable. Variable bills (utilities) are recurring too.
- Price changes must not split a series (Netflix 15.49 → 17.99).
- Frequent-but-irregular merchants (the daily coffee shop, the monthly-ish
  restaurant) must NOT match: intervals have to conform to the cadence AND
  observed occurrences must cover most of the expected slots in the span.
- A missed occurrence is tolerated: an interval of ~2 periods conforms and
  is counted as one miss.
- "Active" is judged against the newest transaction in the DB, not today —
  imports lag real time, and everything would otherwise look lapsed.
- Two occurrences are enough only for yearly cadence, with near-identical
  amounts, and only when they are the merchant's entire history: that's how
  an annual renewal shows up in ~15 months of data, while two restaurant
  visits that happen to land months apart at similar prices stay out.
"""
from collections import Counter
from datetime import date as Date, timedelta
from statistics import median, pstdev

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from db.database import get_db
from db.models import Transaction
from routers.summaries import EXCLUDED_FROM_SPEND

router = APIRouter(prefix="/api/recurring", tags=["recurring"])

# (period_days, label, jitter tolerance in days)
PERIODS = [
    (7.0, "weekly", 2.0),
    (14.0, "every 2 weeks", 3.5),
    (30.44, "monthly", 7.0),
    (60.88, "every 2 months", 10.0),
    (91.31, "quarterly", 15.0),
    (182.62, "every 6 months", 24.0),
    (365.25, "yearly", 31.0),
]

TWO_OCCURRENCE_MIN_PERIOD = 300.0  # yearly only
ACTIVE_GAP_FACTOR = 1.75           # ended if gap since last > 1.75 * period
TRANSFER_CATEGORIES = EXCLUDED_FROM_SPEND | {"Savings"}


def _match_cadence(dates: list[Date]) -> dict | None:
    """Judge whether sorted unique dates follow one of the known cadences."""
    intervals = [(b - a).days for a, b in zip(dates, dates[1:])]
    med = median(intervals)

    best = None
    for p, label, tol in PERIODS:
        gap = abs(med - p)
        if gap <= tol and (best is None or gap < best[3]):
            best = (p, label, tol, gap)
    if best is None:
        return None
    p, label, tol, _ = best

    if len(dates) == 2:
        # Single interval: only trust long cadences, and require a direct hit
        # (no missed-occurrence allowance with this little evidence).
        if p < TWO_OCCURRENCE_MIN_PERIOD or abs(intervals[0] - p) > tol:
            return None
        conforming, missed = 1, 0
    else:
        conforming = 0
        missed = 0
        for d in intervals:
            k = max(1, round(d / p))
            # k > 1 means k-1 missed occurrences inside this gap; allow a
            # little extra jitter there since misses compound drift.
            if k <= 3 and abs(d - k * p) <= tol * (1.0 if k == 1 else 1.5):
                conforming += 1
                missed += k - 1

    ratio = conforming / len(intervals)
    span = (dates[-1] - dates[0]).days
    coverage = len(dates) / (span / p + 1)

    if len(dates) > 2:
        # Weekly is the easiest cadence to hit by accident, so hold it to a
        # higher bar than the rest.
        if p == 7.0 and (ratio < 0.75 or len(dates) < 4):
            return None
        if ratio < 0.7 or conforming < 2 or coverage < 0.6:
            return None

    # The 14-day window also catches twice-a-month billing (1st & 15th style,
    # alternating ~13/18-day gaps). Label it for what it is.
    if p == 14.0:
        avg = sum(intervals) / len(intervals)
        if avg >= 14.8:
            p, label = 15.22, "twice a month"

    return {
        "period_days": p,
        "cadence": label,
        "conformity": round(ratio, 3),
        "missed": missed,
        "coverage": round(min(coverage, 1.0), 3),
    }


def _build_series(txns: list[tuple], merchant: str, category: str,
                  direction: str, asof: Date, whole_group: bool) -> dict | None:
    """txns: list of (id, date, magnitude). Returns a series dict or None."""
    dates = sorted({t[1] for t in txns})
    if len(dates) < 2:
        return None
    cad = _match_cadence(dates)
    if cad is None:
        return None

    amounts = [t[2] for t in txns]
    typical = median(amounts)
    if typical <= 0:
        return None
    if len(dates) == 2:
        # An annual renewal is the merchant's whole story and repeats at
        # (almost) the same price. A pair carved out of a busier merchant,
        # or with loosely-similar amounts, is coincidence.
        if not whole_group or (max(amounts) - min(amounts)) > max(1.0, 0.04 * typical):
            return None

    p = cad["period_days"]
    mean_amt = sum(amounts) / len(amounts)
    cv = pstdev(amounts) / mean_amt if mean_amt else 0.0

    gap = (asof - dates[-1]).days
    active = gap <= ACTIVE_GAP_FACTOR * p
    next_expected = dates[-1] + timedelta(days=round(p)) if active else None

    amount_score = 1 - min(cv / 0.5, 1.0)
    count_score = min(len(dates) / 6, 1.0)
    confidence = 0.55 * cad["conformity"] + 0.25 * count_score + 0.2 * amount_score

    if direction == "income":
        bucket = "transfers" if category in TRANSFER_CATEGORIES else "income"
    else:
        bucket = "transfers" if category in TRANSFER_CATEGORIES else "bills"

    last_txn = max(txns, key=lambda t: t[1])
    return {
        "merchant": merchant,
        "category": category,
        "bucket": bucket,
        "direction": direction,
        "cadence": cad["cadence"],
        "period_days": p,
        "count": len(dates),
        "first_date": dates[0].isoformat(),
        "last_date": dates[-1].isoformat(),
        "typical_amount": round(typical, 2),
        "last_amount": round(last_txn[2], 2),
        "amount_min": round(min(amounts), 2),
        "amount_max": round(max(amounts), 2),
        "amount_type": "fixed" if cv <= 0.06 else "variable",
        "monthly_equivalent": round(typical * 30.44 / p, 2),
        "status": "active" if active else "ended",
        "next_expected": next_expected.isoformat() if next_expected else None,
        "confidence": round(confidence, 3),
        "conformity": cad["conformity"],
        "missed": cad["missed"],
        "transactions": [
            {"id": t[0], "date": t[1].isoformat(), "amount": round(t[2], 2)}
            for t in sorted(txns, key=lambda t: t[1], reverse=True)
        ],
    }


def _amount_clusters(txns: list[tuple]) -> list[list[tuple]]:
    """Split a merchant's txns into bands of similar magnitude. Generous
    tolerance so price changes stay in one band."""
    txns = sorted(txns, key=lambda t: t[2])
    clusters: list[list[tuple]] = [[txns[0]]]
    for t in txns[1:]:
        anchor = clusters[-1][0][2]
        if t[2] <= max(anchor * 1.3, anchor + 2.5):
            clusters[-1].append(t)
        else:
            clusters.append([t])
    return clusters


@router.get("")
def recurring(db: Session = Depends(get_db)):
    rows = db.query(Transaction.id, Transaction.date, Transaction.amount,
                    Transaction.description, Transaction.category) \
             .order_by(Transaction.date).all()
    if not rows:
        return {"asof": None,
                "summary": {"bills_monthly": 0, "bills_count": 0,
                            "income_monthly": 0, "transfers_monthly": 0,
                            "ended_recent": 0, "by_category": []},
                "series": []}

    asof = max(r.date for r in rows)

    groups: dict[tuple[str, str], list] = {}
    cats: dict[tuple[str, str], Counter] = {}
    for r in rows:
        if not r.amount:
            continue
        direction = "expense" if r.amount > 0 else "income"
        key = (r.description, direction)
        groups.setdefault(key, []).append((r.id, r.date, abs(float(r.amount))))
        cats.setdefault(key, Counter())[r.category] += 1

    series = []
    for (desc, direction), txns in groups.items():
        category = cats[(desc, direction)].most_common(1)[0][0]
        whole = _build_series(txns, desc, category, direction, asof,
                              whole_group=True)
        if whole is not None:
            found = [whole]
        else:
            # The merchant as a whole isn't periodic — look for a periodic
            # amount band inside it (subscription mixed with one-off buys).
            found = []
            for cluster in _amount_clusters(txns):
                if len(cluster) < 3 or len(cluster) == len(txns):
                    continue
                s = _build_series(cluster, desc, category, direction, asof,
                                  whole_group=False)
                if s is not None:
                    found.append(s)
        for i, s in enumerate(found):
            s["key"] = f"{desc}::{direction}::{i}"
            series.append(s)

    series.sort(key=lambda s: (s["status"] != "active", -s["monthly_equivalent"]))

    def monthly_total(bucket: str) -> float:
        return round(sum(s["monthly_equivalent"] for s in series
                         if s["bucket"] == bucket and s["status"] == "active"), 2)

    by_cat: dict[str, dict] = {}
    for s in series:
        if s["bucket"] != "bills" or s["status"] != "active":
            continue
        e = by_cat.setdefault(s["category"], {"category": s["category"],
                                              "monthly": 0.0, "count": 0})
        e["monthly"] += s["monthly_equivalent"]
        e["count"] += 1
    by_category = sorted(({**e, "monthly": round(e["monthly"], 2)}
                          for e in by_cat.values()),
                         key=lambda e: -e["monthly"])

    ended_recent = sum(
        1 for s in series
        if s["status"] == "ended" and s["bucket"] == "bills"
        and (asof - Date.fromisoformat(s["last_date"])).days <= 120
    )

    return {
        "asof": asof.isoformat(),
        "summary": {
            "bills_monthly": monthly_total("bills"),
            "bills_count": sum(1 for s in series
                               if s["bucket"] == "bills" and s["status"] == "active"),
            "income_monthly": monthly_total("income"),
            "transfers_monthly": monthly_total("transfers"),
            "ended_recent": ended_recent,
            "by_category": by_category,
        },
        "series": series,
    }
