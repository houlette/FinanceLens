from datetime import datetime
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from sqlalchemy import and_

from db.database import get_db
from db.models import Transaction, RawImport
from ingest.csv_parser import parse_csv
from ingest.apply_rules import normalize_rows

router = APIRouter(prefix="/api/ingest", tags=["ingest"])


@router.post("/csv")
async def upload_csv(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(400, "Expected a .csv file")
    content = await file.read()

    rows, info = parse_csv(content, file.filename)
    normalize_rows(rows, db)

    inserted = 0
    skipped = 0
    for r in rows:
        # Explicit dedup check — SQLite UniqueConstraint treats NULL as distinct,
        # so we look up matching (date, amount, raw, account) directly.
        exists = db.query(Transaction.id).filter(and_(
            Transaction.date == r["date"],
            Transaction.amount == r["amount"],
            Transaction.description_raw == r["description_raw"],
            (Transaction.account_number == r["account_number"]
             if r["account_number"] is not None
             else Transaction.account_number.is_(None)),
        )).first()
        if exists:
            skipped += 1
            continue
        db.add(Transaction(**r))
        try:
            db.commit()
            inserted += 1
        except IntegrityError:
            db.rollback()
            skipped += 1

    log = RawImport(
        filename=file.filename,
        imported_at=datetime.utcnow(),
        row_count=len(rows),
        rows_inserted=inserted,
        rows_skipped=skipped,
        detected_format=info.get("detected_format"),
        warnings="\n".join(info.get("warnings", [])) or None,
    )
    db.add(log)
    db.commit()

    return {
        "filename": file.filename,
        "parsed": len(rows),
        "inserted": inserted,
        "skipped_duplicates": skipped,
        "detected_format": info.get("detected_format"),
        "warnings": info.get("warnings", []),
    }


@router.get("/status")
def status(db: Session = Depends(get_db)):
    from sqlalchemy import func
    row = db.query(
        func.count(Transaction.id),
        func.min(Transaction.date),
        func.max(Transaction.date),
    ).first()
    logs = db.query(RawImport).order_by(RawImport.imported_at.desc()).limit(20).all()
    return {
        "transactions": {
            "count": row[0] or 0,
            "from": str(row[1]) if row[1] else None,
            "to": str(row[2]) if row[2] else None,
        },
        "imports": [
            {
                "filename": l.filename,
                "at": l.imported_at.isoformat() if l.imported_at else None,
                "parsed": l.row_count,
                "inserted": l.rows_inserted,
                "skipped": l.rows_skipped,
                "format": l.detected_format,
                "warnings": l.warnings,
            }
            for l in logs
        ],
    }
