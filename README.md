# FinanceLens

Local-first personal finance analysis. Import bank/credit-card CSV exports,
categorize transactions with your own rules, and explore spending through a
dashboard of charts and insights. Everything runs on your machine; no data
leaves it.

## Features

- **CSV import** with format detection (handles several bank header
  conventions), dedup on re-import, and import history.
- **Rule-based categorization** — case-insensitive substring rules match the
  raw bank description; explicit priority first, longest pattern wins ties.
  Merchant aliases normalize messy descriptions ("AMZN Mktp…" → "Amazon").
- **Triage queue** — the Rules view surfaces merchants that no rule covers,
  ranked by frequency/spend, with one-click rule creation and automatic
  re-apply to past transactions.
- **Dashboard & insights** — monthly spend by category, income vs. spend,
  month-over-month movers, high-value transactions, quarter comparisons.

## Stack

FastAPI + SQLAlchemy + SQLite backend; React + Vite + TanStack Query frontend.

## Quickstart

```bash
# Backend
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt

# Frontend
cd frontend && npm install && cd ..

# Run both (backend :5231, frontend :5230 — see ~/Documents/Projects/PORTS.md)
./start.sh
```

Then open http://localhost:5230 and upload a CSV on the Import view.

### CSV format

A header row with a date column (`Transaction Date`, `Trans. Date`, or
`Date`), a `Description` column, and either a signed `Amount` column or
`Credit`/`Debit` columns. A `Category` column, if present, is used as the
fallback category when no rule matches.

## Privacy

Your data stays local and out of git:

- `data/` (the SQLite DB, backups, and your personal seed rules) is
  gitignored.
- On first boot with an empty database, the app seeds starter rules from
  `data/seed_rules.local.json` if it exists, otherwise from a small generic
  sample set in `backend/ingest/seed_rules.py`. Keep your own rules in the
  local JSON; don't put personal merchants in the sample set.
- Notebooks (`*.ipynb`) are gitignored since their outputs tend to embed real
  transactions.
