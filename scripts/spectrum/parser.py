"""PDF parser for Spectrum utility bills."""
import re
from datetime import datetime, date
from pathlib import Path
from typing import Optional
import pdfplumber

from models import InternetBillData, DocumentType


def parse_date(date_str: str, ref_year: int = None) -> Optional[date]:
    """Parse date from various formats used by Spectrum.

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

    # Spectrum uses formats like "Jan 19, 2026", "Feb 06", "Jan 19 - Feb 18"
    formats = [
        "%b %d, %Y",     # Jan 19, 2026
        "%b %d %Y",      # Jan 19 2026
        "%B %d, %Y",     # January 19, 2026
        "%B %d %Y",      # January 19 2026
        "%m/%d/%y",      # 01/19/26
        "%m/%d/%Y",      # 01/19/2026
        "%Y-%m-%d",      # 2026-01-19
    ]

    for fmt in formats:
        try:
            return datetime.strptime(date_str, fmt).date()
        except ValueError:
            continue

    # Try formats without year - append reference year
    formats_no_year = [
        "%b %d",         # Jan 19 or Feb 06
        "%B %d",         # January 19
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
    ]

    # Regular bill indicators
    bill_indicators = [
        "spectrum",
        "internet",
        "amount due",
        "billing",
        "statement date",
        "service from",
        "auto pay",
        "promotional discount",
    ]

    disconnect_score = sum(1 for ind in disconnect_indicators if ind in text_lower)
    bill_score = sum(1 for ind in bill_indicators if ind in text_lower)

    if disconnect_score >= 2:
        return DocumentType.DISCONNECT_NOTICE
    elif bill_score >= 3:
        return DocumentType.BILL
    return DocumentType.UNKNOWN


def extract_account_number(text: str) -> Optional[str]:
    """Extract account number from text (format: 8349 10 012 2086755)."""
    patterns = [
        # Account Number 8349 10 012 2086755 or with spaces
        r'Account\s*Number\s*(\d{4}\s*\d{2}\s*\d{3}\s*\d{7})',
        r'ACCOUNT\s*NUMBER\s*(\d{4}\s*\d{2}\s*\d{3}\s*\d{7})',
        # Just the pattern itself (16 digits with spaces)
        r'(\d{4}\s+\d{2}\s+\d{3}\s+\d{7})',
        # Compact format
        r'(\d{16})',
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
    # Spectrum bill format has SERVICE ADDRESS header followed by address
    # SERVICE ADDRESS
    # 118 KING ARTHUR CT
    # MORRISVILLE, NC 27560

    # Pattern 1: After SERVICE ADDRESS header
    patterns = [
        r'SERVICE\s+ADDRESS\s*\n?(\d+\s+[A-Z][A-Z0-9\s]+(?:CT|ST|AVE|DR|RD|LN|WAY|BLVD|PL|CIR))\s*\n?\s*([A-Z]+,?\s*[A-Z]{2}\s*\d{5})',
        r'Service\s+Address\s*\n?(\d+\s+[A-Za-z][A-Za-z0-9\s]+(?:CT|ST|AVE|DR|RD|LN|WAY|BLVD|PL|CIR|Ct|St|Ave|Dr|Rd|Ln|Way|Blvd|Pl|Cir))',
    ]

    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
        if match:
            street = match.group(1).strip()
            if match.lastindex >= 2:
                city_state = match.group(2).strip()
                return f"{street}, {city_state}"
            return street

    # Fallback: Look for address patterns in mailing address section
    # The bill shows "KALIN IVANOR\n118 KING ARTHUR CT\nMORRISVILLE NC 27560"
    addr_pattern = r'\n(\d+\s+[A-Z][A-Z0-9\s]+(?:CT|ST|AVE|DR|RD|LN|WAY|BLVD|PL|CIR))\s*\n\s*([A-Z]+)\s+([A-Z]{2})\s+(\d{5})'
    match = re.search(addr_pattern, text, re.IGNORECASE)
    if match:
        return f"{match.group(1).strip()}, {match.group(2).strip()}, {match.group(3).strip()} {match.group(4)}"

    return None


def parse_regular_bill(text: str, pdf_path: str) -> InternetBillData:
    """Parse a regular Spectrum bill PDF."""
    account_number = extract_account_number(text) or "UNKNOWN"
    service_address = extract_service_address(text) or "UNKNOWN"

    # Extract statement/bill date (format: "Jan 19, 2026" or "STATEMENT DATE Jan 19, 2026")
    bill_date = None
    bill_date_patterns = [
        r'STATEMENT\s+DATE\s*\n?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})',
        r'Statement\s+Date\s*:?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})',
        # Spectrum format: column layout with "STATEMENT DATE" followed by date on same line
        r'STATEMENT DATE\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})',
        # Also try to find date pattern like "Jan 19, 2026" near SERVICE ADDRESS
        r'SERVICE ADDRESS.*?([A-Za-z]{3}\s+\d{1,2},\s+\d{4})',
    ]
    for pattern in bill_date_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            bill_date = parse_date(match.group(1))
            if bill_date:
                break

    # If still not found, look for line with account number followed by date
    # Format: "8349 10 012 2086755 Jan 19, 2026 118 KING..."
    if not bill_date:
        date_near_account = re.search(r'\d{4}\s+\d{2}\s+\d{3}\s+\d{7}\s+([A-Za-z]{3}\s+\d{1,2},\s+\d{4})', text)
        if date_near_account:
            bill_date = parse_date(date_near_account.group(1))

    # Extract due date (format: "Feb 06" or "Due by Feb 06")
    due_date = None
    ref_year = bill_date.year if bill_date else datetime.now().year
    due_date_patterns = [
        r'Due\s+by\s+([A-Za-z]+\s+\d{1,2})',
        r'Due\s+Date\s*:?\s*([A-Za-z]+\s+\d{1,2},?\s*\d{0,4})',
        r'Amount\s+Due\s*\$?[\d,.]+\s*\n?\s*Due\s+by\s+([A-Za-z]+\s+\d{1,2})',
    ]
    for pattern in due_date_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            date_str = match.group(1)
            due_date = parse_date(date_str, ref_year)
            # Adjust year if due date is before bill date (spans year boundary)
            if due_date and bill_date and due_date < bill_date:
                due_date = parse_date(date_str, ref_year + 1)
            if due_date:
                break

    # Extract amount due (format: "$70" or "Amount Due $70")
    amount_due = 0.0
    amount_patterns = [
        r'Amount\s+Due\s*\$?([\d,]+\.?\d*)',
        r'Auto\s+Pay\s+Amount\s*\$?([\d,]+\.?\d*)',
        r'Total\s+Amount\s+Due\s*\$?([\d,]+\.?\d*)',
    ]
    for pattern in amount_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            amount_due = parse_amount(match.group(1))
            break

    # Extract billing period (format: "Service from Jan 19 - Feb 18")
    billing_start = None
    billing_end = None

    billing_patterns = [
        r'Service\s+from\s+([A-Za-z]+\s+\d{1,2})\s*[-–]\s*([A-Za-z]+\s+\d{1,2})',
        r'Billing\s+Period\s*:?\s*([A-Za-z]+\s+\d{1,2})\s*[-–]\s*([A-Za-z]+\s+\d{1,2})',
    ]
    for pattern in billing_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            billing_start = parse_date(match.group(1), ref_year)
            billing_end = parse_date(match.group(2), ref_year)
            # Adjust year if end date is before start date (spans year boundary)
            if billing_start and billing_end and billing_end < billing_start:
                billing_end = parse_date(match.group(2), ref_year + 1)
            break

    # Extract internet charges (Spectrum Internet Total)
    internet_charges = 0.0
    internet_patterns = [
        r'Spectrum\s+Internet[^\$]*Total\s*\$?([\d,]+\.?\d*)',
        r'Spectrum\s+Internet\s*\$?([\d,]+\.?\d*)',
        r'Internet\s+Total\s*\$?([\d,]+\.?\d*)',
    ]
    for pattern in internet_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            internet_charges = parse_amount(match.group(1))
            break

    # If internet_charges not found, use amount_due
    if internet_charges == 0.0 and amount_due > 0:
        internet_charges = amount_due

    # Extract previous balance
    previous_balance = 0.0
    prev_match = re.search(r'Previous\s+Balance\s*\$?([\d,]+\.?\d*)', text, re.IGNORECASE)
    if prev_match:
        previous_balance = parse_amount(prev_match.group(1))

    # Extract payments received (format: "EFT Payment 01/06 -$65")
    payments_received = 0.0
    payment_patterns = [
        r'(?:EFT\s+)?Payment[^-\d]*(-?\$?[\d,]+\.?\d*)',
        r'Payments?\s+Received[^-\d]*(-?\$?[\d,]+\.?\d*)',
    ]
    for pattern in payment_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            payments_received = abs(parse_amount(match.group(1)))
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
    Parse a Spectrum utility PDF and extract bill data.

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
