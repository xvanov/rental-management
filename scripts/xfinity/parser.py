"""PDF parser for Xfinity utility bills."""
import re
from datetime import datetime, date
from pathlib import Path
from typing import Optional
import pdfplumber

from models import InternetBillData, DocumentType


def parse_date(date_str: str, ref_year: int = None) -> Optional[date]:
    """Parse date from various formats used by Xfinity.

    Args:
        date_str: Date string to parse
        ref_year: Reference year for dates without year (e.g., "Feb 06")
    """
    if not date_str:
        return None

    date_str = date_str.strip()

    # If no year provided, use current year
    if ref_year is None:
        ref_year = datetime.now().year

    # Xfinity uses formats like "Jan 05, 2026", "Feb 09, 2026"
    formats = [
        "%b %d, %Y",     # Jan 05, 2026
        "%b %d %Y",      # Jan 05 2026
        "%B %d, %Y",     # January 05, 2026
        "%B %d %Y",      # January 05 2026
        "%m/%d/%y",      # 01/05/26
        "%m/%d/%Y",      # 01/05/2026
        "%Y-%m-%d",      # 2026-01-05
    ]

    for fmt in formats:
        try:
            return datetime.strptime(date_str, fmt).date()
        except ValueError:
            continue

    # Try formats without year - append reference year
    formats_no_year = [
        "%b %d",         # Jan 05 or Feb 09
        "%B %d",         # January 05
    ]

    for fmt in formats_no_year:
        try:
            parsed = datetime.strptime(f"{date_str} {ref_year}", f"{fmt} %Y").date()
            return parsed
        except ValueError:
            continue

    return None


def parse_amount(amount_str: str) -> float:
    """Parse dollar amount from string."""
    if not amount_str:
        return 0.0
    # Remove $ and commas, handle negative
    cleaned = re.sub(r'[,$]', '', amount_str.strip())
    # Handle negative amounts like "-65.00"
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def detect_document_type(text: str) -> DocumentType:
    """Detect if document is a regular bill or disconnect notice."""
    text_lower = text.lower()

    # Disconnect/delinquency indicators
    disconnect_indicators = [
        "disconnect notice",
        "service disconnection",
        "final notice",
        "past due",
        "termination of service",
        "service will be disconnected",
        "collection agency",
        "suspension notice",
    ]

    # Regular bill indicators (Xfinity-specific)
    bill_indicators = [
        "xfinity",
        "comcast",
        "amount due",
        "billing date",
        "services from",
        "automatic payment",
        "your bill at a glance",
        "thank you for choosing xfinity",
        "regular monthly charges",
    ]

    disconnect_score = sum(1 for ind in disconnect_indicators if ind in text_lower)
    bill_score = sum(1 for ind in bill_indicators if ind in text_lower)

    if disconnect_score >= 2:
        return DocumentType.DISCONNECT_NOTICE
    elif bill_score >= 3:
        return DocumentType.BILL
    return DocumentType.UNKNOWN


def extract_account_number(text: str) -> Optional[str]:
    """Extract account number from text (Xfinity format: 8155 60 082 0617408)."""
    patterns = [
        # Account Number 8155 60 082 0617408 format
        r'Account\s*Number\s*(\d{4}\s*\d{2}\s*\d{3}\s*\d{7})',
        r'ACCOUNT\s*NUMBER\s*(\d{4}\s*\d{2}\s*\d{3}\s*\d{7})',
        # Just the pattern itself (16 digits with spaces)
        r'(\d{4}\s+\d{2}\s+\d{3}\s+\d{7})',
        # Compact format (16 digits)
        r'Account\s*(?:Number|#|:)?\s*(\d{16})',
    ]

    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            # Normalize to standard format with spaces
            raw = match.group(1).replace(" ", "")
            if len(raw) == 16:
                return f"{raw[:4]} {raw[4:6]} {raw[6:9]} {raw[9:]}"
            return match.group(1).strip()
    return None


def extract_service_address(text: str) -> Optional[str]:
    """Extract service address from text."""
    # Xfinity bill format: "For 3448 BERETANIA WAY, SACRAMENTO, CA, 95834-2548"
    patterns = [
        # "For" prefix pattern (most common in Xfinity bills)
        r'For\s+(\d+\s+[A-Z][A-Z0-9\s]+(?:WAY|CT|ST|AVE|DR|RD|LN|BLVD|PL|CIR)[,\s]+[A-Z]+[,\s]+[A-Z]{2}[,\s]+\d{5}(?:-\d{4})?)',
        # Alternative: look in mailing section
        r'\n([A-Z][A-Z\s]+)\n(\d+\s+[A-Z][A-Z0-9\s]+(?:WAY|CT|ST|AVE|DR|RD|LN|BLVD|PL|CIR))\s*\n\s*([A-Z]+)[,\s]+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)',
    ]

    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            if match.lastindex >= 4:
                # Multi-group pattern
                return f"{match.group(2).strip()}, {match.group(3).strip()}, {match.group(4).strip()} {match.group(5)}"
            return match.group(1).strip()

    # Fallback: Look for address near name in mailing section
    # Pattern: NAME\n123 STREET NAME WAY\nCITY, ST 12345
    addr_pattern = r'([A-Z][A-Z\s]+)\n(\d+\s+[A-Z][A-Z0-9\s]+(?:WAY|CT|ST|AVE|DR|RD|LN|BLVD|PL|CIR))\s*\n([A-Z]+),?\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)'
    match = re.search(addr_pattern, text)
    if match:
        return f"{match.group(2).strip()}, {match.group(3).strip()}, {match.group(4).strip()} {match.group(5)}"

    return None


def parse_regular_bill(text: str, pdf_path: str) -> InternetBillData:
    """Parse a regular Xfinity bill PDF."""
    account_number = extract_account_number(text) or "UNKNOWN"
    service_address = extract_service_address(text) or "UNKNOWN"

    # Extract bill/billing date (format: "Jan 05, 2026")
    # Xfinity format: "8155 60 082 0617408 Jan 05, 2026 Jan 10, 2026 to Feb 09, 2026 1 of 3"
    bill_date = None
    bill_date_patterns = [
        # Header row format: account number followed by billing date
        r'\d{4}\s+\d{2}\s+\d{3}\s+\d{7}\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})',
        r'Billing\s+Date\s*\n?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})',
        r'Bill\s+Date\s*:?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})',
        r'Statement\s+Date\s*:?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})',
    ]
    for pattern in bill_date_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            bill_date = parse_date(match.group(1))
            if bill_date:
                break

    # Extract due date (for Xfinity this is usually the auto-pay date)
    due_date = None
    ref_year = bill_date.year if bill_date else datetime.now().year
    due_date_patterns = [
        r'(?:Automatic\s+)?[Pp]ayment\s+(?:on\s+)?([A-Za-z]+\s+\d{1,2},?\s+\d{4})',
        r'Due\s+(?:by\s+|Date\s*:?\s*)([A-Za-z]+\s+\d{1,2},?\s*\d{0,4})',
        r'Please\s+pay\s+by\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})',
    ]
    for pattern in due_date_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            date_str = match.group(1)
            due_date = parse_date(date_str, ref_year)
            if due_date:
                break

    # Extract amount due (format: "$71.32" or "Amount due $71.32")
    amount_due = 0.0
    amount_patterns = [
        r'Amount\s+due\s*\$?([\d,]+\.?\d*)',
        r'Please\s+pay\s*\$?([\d,]+\.?\d*)',
        r'New\s+charges\s*\$?([\d,]+\.?\d*)',
        r'Total\s+Amount\s+Due\s*\$?([\d,]+\.?\d*)',
    ]
    for pattern in amount_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            amount_due = parse_amount(match.group(1))
            if amount_due > 0:
                break

    # Extract billing period (format: "Jan 10, 2026 to Feb 09, 2026")
    # Xfinity format in header: "Jan 10, 2026 to Feb 09, 2026 1 of 3"
    billing_start = None
    billing_end = None

    billing_patterns = [
        # Header row format after billing date
        r'([A-Za-z]+\s+\d{1,2},?\s+\d{4})\s+to\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})\s+\d+\s+of\s+\d+',
        r'Services\s+From\s*\n?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})\s*(?:to|-)\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})',
        r'Service\s+(?:from|period)\s*:?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})\s*(?:to|-)\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})',
        r'Billing\s+Period\s*:?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})\s*(?:to|-)\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})',
    ]
    for pattern in billing_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            billing_start = parse_date(match.group(1), ref_year)
            billing_end = parse_date(match.group(2), ref_year)
            if billing_start and billing_end:
                break

    # Extract internet/monthly charges
    internet_charges = 0.0
    internet_patterns = [
        r'Regular\s+monthly\s+charges\s*\$?([\d,]+\.?\d*)',
        r'My\s+Xfinity\s+plan\s*\$?([\d,]+\.?\d*)',
        r'Internet[^\$]*\$?([\d,]+\.?\d*)',
    ]
    for pattern in internet_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            internet_charges = parse_amount(match.group(1))
            if internet_charges > 0:
                break

    # If internet_charges not found, use amount_due
    if internet_charges == 0.0 and amount_due > 0:
        internet_charges = amount_due

    # Extract taxes and fees
    taxes_and_fees = 0.0
    tax_patterns = [
        r'Taxes,\s*fees\s*and\s*other\s*charges\s*\$?([\d,]+\.?\d*)',
        r'Taxes\s*&?\s*(?:government\s*)?fees\s*\$?([\d,]+\.?\d*)',
        r'Sales\s+Tax\s*\$?([\d,]+\.?\d*)',
    ]
    for pattern in tax_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            taxes_and_fees = parse_amount(match.group(1))
            if taxes_and_fees > 0:
                break

    # Extract previous balance
    previous_balance = 0.0
    prev_match = re.search(r'Previous\s+balance\s*\$?([\d,]+\.?\d*)', text, re.IGNORECASE)
    if prev_match:
        previous_balance = parse_amount(prev_match.group(1))

    # Extract payments received (format: "EFT Payment - thank you Jan 02 -$71.32")
    payments_received = 0.0
    payment_patterns = [
        # Xfinity format: "EFT Payment - thank you Jan 02 -$71.32"
        r'EFT\s+Payment\s*-\s*thank\s+you\s+[A-Za-z]+\s+\d+\s+(-?\$?[\d,]+\.?\d*)',
        r'(?:EFT\s+)?Payment[^$\n]*-\$?([\d,]+\.?\d*)',
        r'Payments?\s+Received[^-\d]*(-?\$?[\d,]+\.?\d*)',
    ]
    for pattern in payment_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            payments_received = abs(parse_amount(match.group(1)))
            if payments_received > 0:
                break

    return InternetBillData(
        document_type=DocumentType.BILL,
        account_number=account_number,
        service_address=service_address,
        bill_date=bill_date,
        due_date=due_date,
        amount_due=amount_due,
        billing_period_start=billing_start,
        billing_period_end=billing_end,
        internet_charges=internet_charges,
        taxes_and_fees=taxes_and_fees,
        previous_balance=previous_balance,
        payments_received=payments_received,
        requires_attention=False,
        pdf_path=pdf_path,
        raw_text=text[:500],
    )


def parse_disconnect_notice(text: str, pdf_path: str) -> InternetBillData:
    """Parse a disconnect notice PDF."""
    account_number = extract_account_number(text) or "UNKNOWN"
    service_address = extract_service_address(text) or "UNKNOWN"

    # Extract amount due
    amount_due = 0.0
    amount_match = re.search(r'Amount\s+Due[^\$]*\$?([\d,]+\.?\d*)', text, re.IGNORECASE)
    if amount_match:
        amount_due = parse_amount(amount_match.group(1))

    # Extract due date
    due_date = None
    due_match = re.search(r'(?:Due|Pay\s+by|Disconnect)[^\d]*(\w+\s+\d+,?\s+\d{4})', text, re.IGNORECASE)
    if due_match:
        due_date = parse_date(due_match.group(1))

    return InternetBillData(
        document_type=DocumentType.DISCONNECT_NOTICE,
        account_number=account_number,
        service_address=service_address,
        due_date=due_date,
        amount_due=amount_due,
        requires_attention=True,
        attention_reason="DISCONNECT NOTICE - Internet service disconnection pending",
        pdf_path=pdf_path,
        raw_text=text[:500],
    )


def parse_pdf(pdf_path: str) -> InternetBillData:
    """
    Parse an Xfinity utility PDF and extract bill data.

    Args:
        pdf_path: Path to the PDF file

    Returns:
        InternetBillData with extracted information
    """
    path = Path(pdf_path)
    if not path.exists():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    # Extract text from PDF
    full_text = ""
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            full_text += text + "\n"

    if not full_text.strip():
        return InternetBillData(
            document_type=DocumentType.UNKNOWN,
            account_number="UNKNOWN",
            service_address="UNKNOWN",
            requires_attention=True,
            attention_reason="Could not extract text from PDF",
            pdf_path=pdf_path,
        )

    # Detect document type
    doc_type = detect_document_type(full_text)

    if doc_type == DocumentType.DISCONNECT_NOTICE:
        return parse_disconnect_notice(full_text, pdf_path)
    elif doc_type == DocumentType.BILL:
        return parse_regular_bill(full_text, pdf_path)
    else:
        # Unknown type - try to extract basic info
        account_number = extract_account_number(full_text) or "UNKNOWN"
        service_address = extract_service_address(full_text) or "UNKNOWN"

        return InternetBillData(
            document_type=DocumentType.UNKNOWN,
            account_number=account_number,
            service_address=service_address,
            requires_attention=True,
            attention_reason="Unknown document type - manual review required",
            pdf_path=pdf_path,
            raw_text=full_text[:500],
        )


if __name__ == "__main__":
    # Test with sample files
    import sys

    if len(sys.argv) > 1:
        pdf_path = sys.argv[1]
        print(f"\n{'='*60}")
        print(f"Parsing: {pdf_path}")
        print('='*60)
        result = parse_pdf(pdf_path)
        print(result.to_json())
    else:
        print("Usage: python parser.py <pdf_path>")
