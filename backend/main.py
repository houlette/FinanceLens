from dotenv import load_dotenv
load_dotenv()

from datetime import datetime
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db.database import SessionLocal, init_db
from ingest.seed_rules import seed_if_empty
from routers import ingest, transactions, summaries, rules, insights

log = logging.getLogger("financelens")

app = FastAPI(title="FinanceLens API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", "http://localhost:5174", "http://localhost:4173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ingest.router)
app.include_router(transactions.router)
app.include_router(summaries.router)
app.include_router(rules.router)
app.include_router(insights.router)


@app.on_event("startup")
def startup():
    init_db()
    db = SessionLocal()
    try:
        result = seed_if_empty(db)
        if result["rules_added"] or result["aliases_added"]:
            log.info("Seeded rules: %s", result)
    finally:
        db.close()


@app.get("/api/health")
def health():
    return {"status": "ok", "time": datetime.utcnow().isoformat() + "Z"}
