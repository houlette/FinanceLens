"""CSV ingest for credit-card/bank statements.

Handles the three header conventions found in the source notebook:
    "Transaction date", "Trans. Date", "Transaction Date"
plus Credit/Debit vs Credit/debit-indicator amount columns.

Returns a list of normalized dict rows ready to insert as Transaction.
"""
from __future__ import annotations

import io
from datetime import date as Date
from typing import Any

import pandas as pd

from .seed_rules import CATEGORY_REMAP


_DATE_COLS = ("Transaction date", "Trans. Date", "Transaction Date", "Date")


def _detect_date_column(df: pd.DataFrame) -> str | None:
    for col in _DATE_COLS:
        if col in df.columns:
            return col
    return None


def _parse_dates(series: pd.Series) -> pd.Series:
    try:
        return pd.to_datetime(series)
    except (ValueError, TypeError):
        return pd.to_datetime(series, format="%m/%d/%Y")


def _normalize_amount(df: pd.DataFrame) -> pd.DataFrame:
    """Ensure df has a single signed 'Amount' column (positive = spend)."""
    if "Credit/debit indicator" in df.columns:
        if "Amount" in df.columns:
            df.loc[df["Credit/debit indicator"] == "Credit", "Amount"] *= -1
        df = df.drop(columns=["Credit/debit indicator"])
    elif "Credit" in df.columns and "Debit" in df.columns:
        df["Amount"] = df["Debit"].fillna(0) - df["Credit"].fillna(0)
        df = df.drop(columns=["Credit", "Debit"])
    return df


def _detect_account_column(df: pd.DataFrame) -> str | None:
    for col in df.columns:
        if "account" in col.lower() and "number" in col.lower():
            return col
    return None


def parse_csv(content: bytes, filename: str = "") -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Parse a CSV into a list of normalized transaction dicts.

    Returns (rows, info) where info has detected_format / warnings.
    """
    warnings: list[str] = []
    try:
        df = pd.read_csv(io.BytesIO(content), encoding="latin-1")
    except pd.errors.EmptyDataError:
        return [], {"detected_format": "empty", "warnings": ["File is empty"]}

    if df.empty:
        return [], {"detected_format": "empty", "warnings": ["No data rows"]}

    date_col = _detect_date_column(df)
    if not date_col:
        return [], {"detected_format": "unknown",
                    "warnings": [f"No recognized date column in {list(df.columns)}"]}
    if date_col != "Date":
        df = df.rename(columns={date_col: "Date"})

    if "Category" not in df.columns:
        df["Category"] = "Uncategorized"
    df["Category"] = df["Category"].fillna("Uncategorized").replace(CATEGORY_REMAP)

    df = _normalize_amount(df)
    if "Amount" not in df.columns:
        return [], {"detected_format": "unknown",
                    "warnings": ["Could not derive Amount column"]}

    df["Date"] = _parse_dates(df["Date"])

    # Keep the description raw here; apply_rules.normalize_rows computes the
    # cleaned display description so ingest and re-apply share one code path.
    if "Description" not in df.columns:
        df["Description"] = ""
    df["Description"] = df["Description"].fillna("").astype(str)
    description_raw = df["Description"].copy()

    account_col = _detect_account_column(df)
    check_col = "Check number" if "Check number" in df.columns else None

    rows: list[dict[str, Any]] = []
    for i, row in df.iterrows():
        try:
            amt = float(row["Amount"])
        except (TypeError, ValueError):
            warnings.append(f"Row {i}: non-numeric amount, skipped")
            continue
        d = row["Date"]
        if pd.isna(d):
            warnings.append(f"Row {i}: missing date, skipped")
            continue

        d_iso: Date = d.date() if hasattr(d, "date") else d

        acct = None
        if account_col:
            v = row[account_col]
            if pd.notna(v):
                acct = str(v).strip()

        check = None
        if check_col:
            v = row[check_col]
            if pd.notna(v):
                check = str(v).strip()

        desc_raw = str(description_raw.iloc[i] if i < len(description_raw) else row["Description"])

        rows.append({
            "date": d_iso,
            "description_raw": desc_raw,
            "description": str(row["Description"]).strip() or desc_raw,
            "amount": amt,
            "category": str(row["Category"]).strip() or "Uncategorized",
            "account_number": acct,
            "check_number": check,
            "source_file": filename,
        })

    detected = "credit_debit" if {"Credit", "Debit"} & set(df.columns) else "amount"
    return rows, {"detected_format": detected, "warnings": warnings}
