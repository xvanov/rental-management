"""PDF parser for Enbridge Gas utility bills."""
import re
from datetime import datetime, date
from pathlib import Path
from typing import Optional
import pdfplumber

from models import GasBillData, DocumentType


def parse_date(date_str: str) -> Optional[date]:
    """Parse date from various formats used by Enbridge."""
    if not date_str:
        return None

    date_str = date_str.strip()

    # Enbridge uses formats like "Jan 9 2026", "Feb 4 2026", "01/08/26"
    formats = [
        "%b %d %Y",      # Jan 9 2026
        "%b %d, %Y",     # Jan 9, 2026
        "%B %d %Y",      # January 9 2026
        "%B %d, %Y",     # January 9, 2026
        "%m/%d/%y",      # 01/08/26
        "%m/%d/%Y",      # 01/08/2026
        "%Y-%m-%d",      # 2026-01-08
    ]

    for fmt in formats:
        try:
            return datetime.strptime(date_str, fmt).date()
        except ValueError:
            continue
    return None


def parse_amount(amount_str: str) -> float:
    """Parse dollar amount from string."""
    if not amount_str:
        return 0.0
    # Remove $ and commas, handle negative
    cleaned = re.sub(r'[,$]', '', amount_str.strip())
    # Handle negative amounts like "-66.94"
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
    ]

    # Regular bill indicators
    bill_indicators = [
        "enbridge gas",
        "gas charges",
        "therms",
        "billing period",
        "meter reading",
        "amount due",
        "account summary",
    ]

    disconnect_score = sum(1 for ind in disconnect_indicators if ind in text_lower)
    bill_score = sum(1 for ind in bill_indicators if ind in text_lower)

    if disconnect_score >= 2:
        return DocumentType.DISCONNECT_NOTICE
    elif bill_score >= 3:
        return DocumentType.BILL
    return DocumentType.UNKNOWN


def extract_account_number(text: str) -> Optional[str]:
    """Extract account number from text (format: 7-2101-4365-2043)."""
    patterns = [
        r'ACCOUNT NUMBER\s*(\d-\d{4}-\d{4}-\d{4})',
        r'Account Number\s*(\d-\d{4}-\d{4}-\d{4})',
        r'(\d-\d{4}-\d{4}-\d{4})',
    ]

    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1)
    return None


def extract_service_address(text: str) -> Optional[str]:
    """Extract service address from text."""
    # The Enbridge bill format is:
    # SERVICE FOR ACCOUNT NUMBER Page 1 of 2
    # KALIN S IVANOV 7-2101-4365-2043
    # 1553 UNDERBRUSH DR
    # DURHAM NC 27703

    # Pattern 1: Multi-line extraction after SERVICE FOR
    # Match: name line, then address line, then city line
    multiline_pattern = r'SERVICE FOR.*?\n[A-Z\s]+\d-\d{4}-\d{4}-\d{4}\n(\d+[A-Z]?\s+[A-Z0-9\s]+(?:DR|ST|AVE|CT|RD|LN|WAY|BLVD|PL|CIR|TER))\n'
    match = re.search(multiline_pattern, text, re.IGNORECASE)
    if match:
        return match.group(1).strip()

    # Pattern 2: Look for address line before city/state
    # Match: "310B HOWARD ST" followed by newline and "DURHAM NC"
    addr_before_city = r'(\d+[A-Z]?\s+[A-Z0-9\s]+(?:DR|ST|AVE|CT|RD|LN|WAY|BLVD|PL|CIR|TER))\n[A-Z]+\s+(?:NC|CA)\s+\d{5}'
    match = re.search(addr_before_city, text, re.IGNORECASE)
    if match:
        return match.group(1).strip()

    # Pattern 3: Fallback - look for any address pattern
    fallback_patterns = [
        r'SERVICE FOR\s+\w+(?:\s+\w+)?\s+(\d+[A-Z]?\s+[A-Z0-9\s]+(?:DR|ST|AVE|CT|RD|LN|WAY|BLVD|PL|CIR|TER))',
        r'(\d+[A-Z]?\s+[A-Z]+\s+(?:DR|ST|AVE|CT|RD|LN|WAY))\s+(?:DURHAM|MORRISVILLE)',
    ]

    for pattern in fallback_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1).strip()

    return None


def parse_regular_bill(text: str, pdf_path: str) -> GasBillData:
    """Parse a regular Enbridge Gas bill PDF."""
    account_number = extract_account_number(text) or "UNKNOWN"
    service_address = extract_service_address(text) or "UNKNOWN"

    # Extract bill/statement date
    bill_date = None
    bill_date_patterns = [
        r'JANUARY STATEMENT GENERATED ON:\s*(\w+\s+\d+\s+\d{4})',
        r'STATEMENT GENERATED ON:\s*(\w+\s+\d+\s+\d{4})',
        r'STATEMENT DATE\s*(\w+\s+\d+\s+\d{4})',
        r'Statement Date\s*(\w+\s+\d+,?\s+\d{4})',
    ]
    for pattern in bill_date_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            bill_date = parse_date(match.group(1))
            break

    # Extract due date (format: "Feb 4 2026")
    due_date = None
    due_date_patterns = [
        r'DATE DUE\s*(\w+\s+\d+\s+\d{4})',
        r'Due Date\s*(\w+\s+\d+,?\s+\d{4})',
        r'Amount Due on\s*(\d+/\d+/\d+)',
        r'Feb\s+\d+\s+\d{4}',  # Fallback: look for date near AMOUNT DUE
    ]
    for pattern in due_date_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            # For the fallback pattern, the whole match is the date
            date_str = match.group(1) if match.lastindex else match.group(0)
            due_date = parse_date(date_str)
            if due_date:
                break

    # Extract amount due
    amount_due = 0.0
    amount_patterns = [
        r'AMOUNT DUE\s*\$?([\d,]+\.?\d*)',
        r'Amount Due[^$]*\$?([\d,]+\.?\d*)',
        r'Total Current Charges\s*\$?([\d,]+\.?\d*)',
    ]
    for pattern in amount_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            amount_due = parse_amount(match.group(1))
            break

    # Extract billing period from meter reading section
    # Format: "12/08/25-01/08/26" or "BILLING PERIOD ... 12/08/25-01/08/26"
    billing_start = None
    billing_end = None
    billing_days = 0

    billing_patterns = [
        r'BILLING PERIOD\s+DAYS.*?(\d{2}/\d{2}/\d{2})-(\d{2}/\d{2}/\d{2})\s+(\d+)',
        r'(\d{2}/\d{2}/\d{2})-(\d{2}/\d{2}/\d{2})\s+(\d+)\s+\d+\s+\d+',
    ]
    for pattern in billing_patterns:
        match = re.search(pattern, text)
        if match:
            billing_start = parse_date(match.group(1))
            billing_end = parse_date(match.group(2))
            try:
                billing_days = int(match.group(3))
            except (ValueError, IndexError):
                pass
            break

    # Extract meter number first (before therms to avoid confusion)
    meter_number = None
    meter_match = re.search(r'METER NO\.\s*(\d+)', text, re.IGNORECASE)
    if not meter_match:
        # Try alternate format: just the number after METER NO.
        meter_match = re.search(r'(\d{9})\s+\d{2}/\d{2}/\d{2}', text)
    if meter_match:
        meter_number = meter_match.group(1)

    # Extract therms used (look at end of meter reading line)
    therms_used = 0.0
    # Pattern: BTU FACTOR THERMS followed by number line ending with therms value
    # Example: "1.0470 = 96" where 96 is therms
    therms_patterns = [
        r'THERMS\s+(\d+)\s*$',  # THERMS header followed by value
        r'1\.\d{4}\s*=\s*(\d+)',  # BTU factor = therms pattern
        r'BTU FACTOR\s+THERMS\s+\d+\.\d+\s*=?\s*(\d+)',
    ]
    for pattern in therms_patterns:
        match = re.search(pattern, text, re.MULTILINE | re.IGNORECASE)
        if match:
            therms_used = float(match.group(1))
            break

    # Extract charge breakdown
    gas_charges = 0.0
    gas_match = re.search(r'Total Gas Charges\s*\$?([\d,]+\.?\d*)', text, re.IGNORECASE)
    if gas_match:
        gas_charges = parse_amount(gas_match.group(1))

    basic_facilities_charge = 0.0
    basic_match = re.search(r'Basic Facilities Charge\s*([\d,]+\.?\d*)', text, re.IGNORECASE)
    if basic_match:
        basic_facilities_charge = parse_amount(basic_match.group(1))

    taxes = 0.0
    tax_match = re.search(r'State Sales Tax[^$\d]*([\d,]+\.?\d*)', text, re.IGNORECASE)
    if tax_match:
        taxes = parse_amount(tax_match.group(1))

    # If gas_charges wasn't found, calculate from amount due
    if gas_charges == 0.0 and amount_due > 0:
        gas_charges = amount_due

    # Previous balance and payments
    previous_balance = 0.0
    prev_match = re.search(r'Previous Bill Amount\s*\$?\s*([\d,]+\.?\d*)', text, re.IGNORECASE)
    if prev_match:
        previous_balance = parse_amount(prev_match.group(1))

    payments_received = 0.0
    payment_match = re.search(r'Payment Received[^-\d]*(-?[\d,]+\.?\d*)', text, re.IGNORECASE)
    if payment_match:
        payments_received = abs(parse_amount(payment_match.group(1)))

    return GasBillData(
        document_type=DocumentType.BILL,
        account_number=account_number,
        service_address=service_address,
        bill_date=bill_date,
        due_date=due_date,
        amount_due=amount_due,
        billing_period_start=billing_start,
        billing_period_end=billing_end,
        billing_days=billing_days,
        therms_used=therms_used,
        meter_number=meter_number,
        gas_charges=gas_charges,
        basic_facilities_charge=basic_facilities_charge,
        taxes=taxes,
        previous_balance=previous_balance,
        payments_received=payments_received,
        requires_attention=False,
        pdf_path=pdf_path,
        raw_text=text[:500],
    )


def parse_disconnect_notice(text: str, pdf_path: str) -> GasBillData:
    """Parse a disconnect notice PDF."""
    account_number = extract_account_number(text) or "UNKNOWN"
    service_address = extract_service_address(text) or "UNKNOWN"

    # Extract amount due
    amount_due = 0.0
    amount_match = re.search(r'Amount Due[^$]*\$?([\d,]+\.?\d*)', text, re.IGNORECASE)
    if amount_match:
        amount_due = parse_amount(amount_match.group(1))

    # Extract due date
    due_date = None
    due_match = re.search(r'(?:Due|Pay by|Disconnect)\s*(?:Date|on)?\s*:?\s*(\w+\s+\d+,?\s+\d{4})', text, re.IGNORECASE)
    if due_match:
        due_date = parse_date(due_match.group(1))

    return GasBillData(
        document_type=DocumentType.DISCONNECT_NOTICE,
        account_number=account_number,
        service_address=service_address,
        due_date=due_date,
        amount_due=amount_due,
        requires_attention=True,
        attention_reason="DISCONNECT NOTICE - Gas service disconnection pending",
        pdf_path=pdf_path,
        raw_text=text[:500],
    )


def parse_pdf(pdf_path: str) -> GasBillData:
    """
    Parse an Enbridge Gas utility PDF and extract bill data.

    Args:
        pdf_path: Path to the PDF file

    Returns:
        GasBillData with extracted information
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
        return GasBillData(
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

        return GasBillData(
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
