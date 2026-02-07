"""Data models for Graham Utilities bills (City of Graham via Edmunds WIPP)."""
from dataclasses import dataclass, field
from datetime import date
from enum import Enum
from typing import Optional
import json


class DocumentType(Enum):
    BILL = "bill"
    DELINQUENCY_NOTICE = "delinquency_notice"
    UNKNOWN = "unknown"


@dataclass
class GrahamBillData:
    """Parsed data from a Graham utility bill."""
    document_type: DocumentType
    account_number: str
    service_location: str

    # Bill info
    bill_date: Optional[date] = None
    due_date: Optional[date] = None
    amount_due: float = 0.0

    # Billing period
    billing_period_start: Optional[date] = None
    billing_period_end: Optional[date] = None

    # Delinquency specific
    disconnect_date: Optional[date] = None
    last_day_to_pay: Optional[date] = None

    # Charge breakdown
    previous_balance: float = 0.0
    current_charges: float = 0.0
    water_charges: float = 0.0
    sewer_charges: float = 0.0
    stormwater_charges: float = 0.0
    refuse_charges: float = 0.0
    recycling_charges: float = 0.0

    # Meter info
    previous_reading: int = 0
    current_reading: int = 0
    usage: int = 0

    # Flags
    requires_attention: bool = False
    attention_reason: Optional[str] = None

    # Source
    pdf_path: Optional[str] = None
    raw_text: str = ""

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "document_type": self.document_type.value,
            "account_number": self.account_number,
            "service_location": self.service_location,
            "bill_date": self.bill_date.isoformat() if self.bill_date else None,
            "due_date": self.due_date.isoformat() if self.due_date else None,
            "amount_due": self.amount_due,
            "billing_period_start": self.billing_period_start.isoformat() if self.billing_period_start else None,
            "billing_period_end": self.billing_period_end.isoformat() if self.billing_period_end else None,
            "disconnect_date": self.disconnect_date.isoformat() if self.disconnect_date else None,
            "last_day_to_pay": self.last_day_to_pay.isoformat() if self.last_day_to_pay else None,
            "previous_balance": self.previous_balance,
            "current_charges": self.current_charges,
            "water_charges": self.water_charges,
            "sewer_charges": self.sewer_charges,
            "stormwater_charges": self.stormwater_charges,
            "refuse_charges": self.refuse_charges,
            "recycling_charges": self.recycling_charges,
            "previous_reading": self.previous_reading,
            "current_reading": self.current_reading,
            "usage": self.usage,
            "requires_attention": self.requires_attention,
            "attention_reason": self.attention_reason,
            "pdf_path": self.pdf_path,
        }

    def to_json(self) -> str:
        """Convert to JSON string."""
        return json.dumps(self.to_dict(), indent=2)


@dataclass
class AccountInfo:
    """Information about a Graham utility account."""
    account_number: str
    service_location: str
    current_balance: float = 0.0
    last_bill_date: Optional[str] = None
    status: str = "unknown"


@dataclass
class FetchResult:
    """Result of fetching bills from the portal."""
    success: bool
    accounts: list[AccountInfo] = field(default_factory=list)
    bills: list[GrahamBillData] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    downloaded_pdfs: list[str] = field(default_factory=list)
