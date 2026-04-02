"""
Shared data models for all utility scrapers.
Provider-specific scrapers subclass BillDataBase for extra fields.
"""
from dataclasses import dataclass, field
from datetime import date, datetime
from enum import Enum
from typing import Optional


class DocumentType(Enum):
    BILL = "bill"
    DISCONNECT_NOTICE = "disconnect_notice"
    DELINQUENCY_NOTICE = "delinquency_notice"
    UNKNOWN = "unknown"


@dataclass
class AccountInfo:
    """Unified account information across all scrapers."""
    account_number: str
    service_address: str = ""
    current_balance: float = 0.0
    due_date: Optional[str] = None
    status: str = "unknown"
    is_active: bool = True


@dataclass
class BillDataBase:
    """Base bill data — all providers share these fields."""
    document_type: DocumentType = DocumentType.UNKNOWN
    account_number: str = ""
    service_address: str = ""
    bill_date: Optional[str] = None
    due_date: Optional[str] = None
    amount_due: float = 0.0
    billing_period_start: Optional[str] = None
    billing_period_end: Optional[str] = None
    previous_balance: float = 0.0
    payments_received: float = 0.0
    requires_attention: bool = False
    attention_reason: Optional[str] = None
    pdf_path: Optional[str] = None
    raw_text: str = ""

    def to_dict(self) -> dict:
        d = {
            "document_type": self.document_type.value,
            "account_number": self.account_number,
            "service_address": self.service_address,
            "bill_date": self.bill_date,
            "due_date": self.due_date,
            "amount_due": self.amount_due,
            "billing_period_start": self.billing_period_start,
            "billing_period_end": self.billing_period_end,
            "previous_balance": self.previous_balance,
            "payments_received": self.payments_received,
            "requires_attention": self.requires_attention,
            "attention_reason": self.attention_reason,
            "pdf_path": self.pdf_path,
        }
        # Add any extra fields from subclasses
        for k, v in self.__dict__.items():
            if k not in d and k != "raw_text":
                d[k] = v
        return d


@dataclass
class FetchResult:
    """Unified fetch result across all scrapers."""
    success: bool = False
    accounts: list = field(default_factory=list)
    bills: list = field(default_factory=list)
    errors: list = field(default_factory=list)
    downloaded_pdfs: list = field(default_factory=list)
