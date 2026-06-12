from sqlalchemy import (
    Column, Integer, Float, String, Date, DateTime, Text, Boolean, UniqueConstraint, Index
)
from sqlalchemy.orm import DeclarativeBase
from datetime import datetime


class Base(DeclarativeBase):
    pass


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True)
    date = Column(Date, nullable=False, index=True)
    description_raw = Column(Text, nullable=False)
    description = Column(Text, nullable=False)
    amount = Column(Float, nullable=False)  # positive = spend, negative = income
    category = Column(String(64), nullable=False, index=True)
    account_number = Column(String(64))
    check_number = Column(String(32))
    source_file = Column(String(256))
    user_overridden = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("date", "amount", "description_raw", "account_number",
                         name="uq_txn_dedup"),
        Index("ix_txn_date_category", "date", "category"),
    )


class CategoryRule(Base):
    __tablename__ = "category_rules"

    id = Column(Integer, primary_key=True)
    merchant_pattern = Column(String(128), nullable=False, unique=True)
    category = Column(String(64), nullable=False)
    priority = Column(Integer, nullable=False, default=100)
    active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class MerchantAlias(Base):
    __tablename__ = "merchant_aliases"

    id = Column(Integer, primary_key=True)
    pattern = Column(String(128), nullable=False, unique=True)
    canonical_name = Column(String(128), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class RawImport(Base):
    __tablename__ = "raw_imports"

    id = Column(Integer, primary_key=True)
    filename = Column(String(256), nullable=False)
    imported_at = Column(DateTime, default=datetime.utcnow)
    row_count = Column(Integer, nullable=False, default=0)
    rows_inserted = Column(Integer, nullable=False, default=0)
    rows_skipped = Column(Integer, nullable=False, default=0)
    detected_format = Column(String(64))
    warnings = Column(Text)
