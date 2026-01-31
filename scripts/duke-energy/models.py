"""Data models for Duke Energy utility bills."""
from dataclasses import dataclass, field
from datetime import date
from enum import Enum
from typing import Optional
import json


class DocumentType(Enum):
    BILL = "bill"
    DISCONNECT_NOTICE = "disconnect_notice"
    UNKNOWN = "unknown"


@dataclass
class EnergyBillData:
    """Parsed data from a Duke Energy utility bill."""
    document_type: DocumentType
    account_number: str
    service_address: str

    # Bill info
    bill_date: Optional[date] = None
    due_date: Optional[date] = None
    amount_due: float = 0.0

    # Billing period
    billing_period_start: Optional[date] = None
    billing_period_end: Optional[date] = None
    billing_days: int = 0

    # Usage
    kwh_used: float = 0.0
    meter_number: Optional[str] = None

    # Charge breakdown
    electric_charges: float = 0.0
    taxes: float = 0.0
    previous_balance: float = 0.0
    payments_received: float = 0.0

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
            "service_address": self.service_address,
            "bill_date": self.bill_date.isoformat() if self.bill_date else None,
            "due_date": self.due_date.isoformat() if self.due_date else None,
            "amount_due": self.amount_due,
            "billing_period_start": self.billing_period_start.isoformat() if self.billing_period_start else None,
            "billing_period_end": self.billing_period_end.isoformat() if self.billing_period_end else None,
            "billing_days": self.billing_days,
            "kwh_used": self.kwh_used,
            "meter_number": self.meter_number,
            "electric_charges": self.electric_charges,
            "taxes": self.taxes,
            "previous_balance": self.previous_balance,
            "payments_received": self.payments_received,
            "requires_attention": self.requires_attention,
            "attention_reason": self.attention_reason,
            "pdf_path": self.pdf_path,
        }

    def to_json(self) -> str:
        """Convert to JSON string."""
        return json.dumps(self.to_dict(), indent=2)


@dataclass
class AccountInfo:
    """Information about a Duke Energy account from the portal."""
    account_number: str
    service_address: str
    current_balance: float = 0.0
    last_bill_date: Optional[str] = None
    status: str = "unknown"


@dataclass
class FetchResult:
    """Result of fetching bills from the portal."""
    success: bool
    accounts: list[AccountInfo] = field(default_factory=list)
    bills: list[EnergyBillData] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    downloaded_pdfs: list[str] = field(default_factory=list)
