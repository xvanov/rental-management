"""PDF parser for Durham Water utility bills."""
import re
from datetime import datetime, date
from pathlib import Path
from typing import Optional
import pdfplumber

from models import WaterBillData, DocumentType


def parse_date(date_str: str) -> Optional[date]:
    """Parse date from various formats."""
    if not date_str:
        return None

    date_str = date_str.strip()
    formats = [
        "%m/%d/%Y",
        "%m/%d/%y",
        "%Y-%m-%d",
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
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def detect_document_type(text: str) -> DocumentType:
    """Detect if document is a regular bill or delinquency notice."""
    text_lower = text.lower()

    # Delinquency indicators
    delinquency_indicators = [
        "water will be shut off",
        "disconnect date",
        "last day to pay to stop",
        "water shutoff",
        "past due",
        "payment has not been received",
        "important notice enclosed",
    ]

    # Bill indicators
    bill_indicators = [
        "city of durham utility bill",
        "consumption history",
        "meter number",
        "total current charges due by",
        "balance forward",
        "water consumption inside city",
    ]

    delinquency_score = sum(1 for ind in delinquency_indicators if ind in text_lower)
    bill_score = sum(1 for ind in bill_indicators if ind in text_lower)

    if delinquency_score >= 2:
        return DocumentType.DELINQUENCY_NOTICE
    elif bill_score >= 2:
        return DocumentType.BILL
    return DocumentType.UNKNOWN


def extract_account_number(text: str) -> Optional[str]:
    """Extract account number from text."""
    patterns = [
        r'Account\s*#?:?\s*(\d{12})',
        r'\[Sys_Acct_ID=(\d{12})\]',
        r'Account Number\s*(\d{12})',
        r'(\d{12})\s+IVANOV',  # Pattern from bills
    ]

    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1)
    return None


def extract_service_location(text: str) -> Optional[str]:
    """Extract service address from text."""
    # Try the bracketed format first (most reliable)
    bracket_match = re.search(r'\[CSERVADDR=([^\]]+)\]', text)
    if bracket_match:
        return bracket_match.group(1).strip()

    # Try Service Location label - capture address on the line
    patterns = [
        # Match "Service Location: ADDRESS" up to newline or common following words
        r'Service Location:?\s+(\d+\s+[A-Z0-9]+(?:\s+[A-Z0-9]+)*\s+(?:ST|AVE|DR|CT|RD|LN|WAY|BLVD|PL)(?:\s+[A-Z])?)(?:\s*$|\s*\n|\s+Dear|\s+Apt)',
        r'SL:\s+(\d+\s+[A-Z0-9]+(?:\s+[A-Z0-9]+)*\s+(?:ST|AVE|DR|CT|RD|LN|WAY|BLVD|PL)(?:\s+[A-Z])?)(?:\s*$|\s*\n|\s+[A-Za-z])',
    ]

    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
        if match:
            addr = match.group(1).strip()
            # Clean up the address - remove extra spaces
            addr = re.sub(r'\s+', ' ', addr)
            return addr

    return None


def parse_regular_bill(text: str, pdf_path: str) -> WaterBillData:
    """Parse a regular utility bill PDF."""
    account_number = extract_account_number(text) or "UNKNOWN"
    service_location = extract_service_location(text) or "UNKNOWN"

    # Extract bill date
    bill_date = None
    bill_date_match = re.search(r'\[CDATE=(\d{1,2}/\d{1,2}/\d{4})\]', text)
    if bill_date_match:
        bill_date = parse_date(bill_date_match.group(1))
    else:
        # Try other patterns
        patterns = [
            r'Bill Date\s*(\d{1,2}/\d{1,2}/\d{4})',
            r'Bill Date\s+(\d{1,2}/\d{1,2}/\d{4})',
            r'(\d{1,2}/\d{1,2}/\d{4})\s+\d+\s+\d{12}',  # date before fiscal year and account
        ]
        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                bill_date = parse_date(match.group(1))
                break

    # Extract due date
    due_date = None
    due_date_match = re.search(r'\[CDUEDATE=(\d{1,2}/\d{1,2}/\d{4})\]', text)
    if due_date_match:
        due_date = parse_date(due_date_match.group(1))
    else:
        match = re.search(r'Due By\s*(\d{1,2}/\d{1,2}/\d{4})', text)
        if match:
            due_date = parse_date(match.group(1))

    # Extract amount due
    amount_due = 0.0
    amount_match = re.search(r'Total Amount Due\s*\$?([\d,]+\.?\d*)', text)
    if amount_match:
        amount_due = parse_amount(amount_match.group(1))
    else:
        # Try balance pattern
        balance_match = re.search(r'\[Sys_Balance=([\d.]+)\]', text)
        if balance_match:
            amount_due = parse_amount(balance_match.group(1))

    # Extract billing period from meter reading dates
    billing_start = None
    billing_end = None
    # Pattern: Previous Read Date  Present Read Date
    # Example: 12/08/2025 01/06/2026
    meter_match = re.search(
        r'(\d{1,2}/\d{1,2}/\d{4})\s+(\d{1,2}/\d{1,2}/\d{4})\s+\d+\s+\d+\s+\d+\s+\d+',
        text
    )
    if meter_match:
        billing_start = parse_date(meter_match.group(1))
        billing_end = parse_date(meter_match.group(2))

    # Extract charge breakdown
    water_charges = 0.0
    sewer_charges = 0.0

    water_match = re.search(r'WATER CONSUMPTION[^\$]*\$?([\d,]+\.?\d*)', text, re.IGNORECASE)
    if water_match:
        water_charges += parse_amount(water_match.group(1))
    water_fee_match = re.search(r'WATER SERVICE FEE[^\$]*\$?([\d,]+\.?\d*)', text, re.IGNORECASE)
    if water_fee_match:
        water_charges += parse_amount(water_fee_match.group(1))

    sewer_match = re.search(r'SEWER CONSUMPTION[^\$]*\$?([\d,]+\.?\d*)', text, re.IGNORECASE)
    if sewer_match:
        sewer_charges += parse_amount(sewer_match.group(1))
    sewer_fee_match = re.search(r'SEWER SERVICE FEE[^\$]*\$?([\d,]+\.?\d*)', text, re.IGNORECASE)
    if sewer_fee_match:
        sewer_charges += parse_amount(sewer_fee_match.group(1))

    # Balance forward
    balance_forward = 0.0
    bf_match = re.search(r'Balance Forward\s*\$?([\d,]+\.?\d*)', text, re.IGNORECASE)
    if bf_match:
        balance_forward = parse_amount(bf_match.group(1))

    return WaterBillData(
        document_type=DocumentType.BILL,
        account_number=account_number,
        service_location=service_location,
        bill_date=bill_date,
        due_date=due_date,
        amount_due=amount_due,
        billing_period_start=billing_start,
        billing_period_end=billing_end,
        balance_forward=balance_forward,
        water_charges=water_charges,
        sewer_charges=sewer_charges,
        requires_attention=False,
        pdf_path=pdf_path,
        raw_text=text[:500],  # Store first 500 chars for debugging
    )


def parse_delinquency_notice(text: str, pdf_path: str) -> WaterBillData:
    """Parse a delinquency/disconnect notice PDF."""
    account_number = extract_account_number(text) or "UNKNOWN"
    service_location = extract_service_location(text) or "UNKNOWN"

    # Extract amount due
    amount_due = 0.0
    amount_match = re.search(r'Payment Due:?\s*\$?([\d,]+\.?\d*)', text)
    if amount_match:
        amount_due = parse_amount(amount_match.group(1))
    else:
        balance_match = re.search(r'\[Sys_Balance=([\d.]+)\]', text)
        if balance_match:
            amount_due = parse_amount(balance_match.group(1))

    # Extract disconnect date
    disconnect_date = None
    disconnect_match = re.search(r'Disconnect Date:?\s*(\d{1,2}/\d{1,2}/\d{4})', text)
    if disconnect_match:
        disconnect_date = parse_date(disconnect_match.group(1))
    else:
        # Try alternate pattern
        match = re.search(r'shut off on\s*(\d{1,2}/\d{1,2}/\d{4})', text, re.IGNORECASE)
        if match:
            disconnect_date = parse_date(match.group(1))

    # Extract last day to pay
    last_day = None
    last_day_match = re.search(r'Last Day to Pay[^:]*:?\s*(\d{1,2}/\d{1,2}/\d{4})', text, re.IGNORECASE)
    if last_day_match:
        last_day = parse_date(last_day_match.group(1))
    else:
        match = re.search(r'5 PM on\s*(\d{1,2}/\d{1,2}/\d{4})', text)
        if match:
            last_day = parse_date(match.group(1))

    # Notice date as bill date
    bill_date = None
    date_match = re.search(r'\[CDATE=(\d{1,2}/\d{1,2}/\d{4})\]', text)
    if date_match:
        bill_date = parse_date(date_match.group(1))
    else:
        # Look for date near top of document
        date_patterns = [
            r'(\d{1,2}/\d{1,2}/\d{4})\s*$',  # Date at end of line
            r'^(\d{1,2}/\d{1,2}/\d{4})',      # Date at start of line
        ]
        for pattern in date_patterns:
            match = re.search(pattern, text, re.MULTILINE)
            if match:
                bill_date = parse_date(match.group(1))
                break

    return WaterBillData(
        document_type=DocumentType.DELINQUENCY_NOTICE,
        account_number=account_number,
        service_location=service_location,
        bill_date=bill_date,
        due_date=last_day or disconnect_date,
        amount_due=amount_due,
        disconnect_date=disconnect_date,
        last_day_to_pay=last_day,
        requires_attention=True,
        attention_reason="DELINQUENCY NOTICE - Water shutoff pending",
        pdf_path=pdf_path,
        raw_text=text[:500],
    )


def parse_pdf(pdf_path: str) -> WaterBillData:
    """
    Parse a Durham Water utility PDF and extract bill data.

    Args:
        pdf_path: Path to the PDF file

    Returns:
        WaterBillData with extracted information
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
        return WaterBillData(
            document_type=DocumentType.UNKNOWN,
            account_number="UNKNOWN",
            service_location="UNKNOWN",
            requires_attention=True,
            attention_reason="Could not extract text from PDF",
            pdf_path=pdf_path,
        )

    # Detect document type
    doc_type = detect_document_type(full_text)

    if doc_type == DocumentType.DELINQUENCY_NOTICE:
        return parse_delinquency_notice(full_text, pdf_path)
    elif doc_type == DocumentType.BILL:
        return parse_regular_bill(full_text, pdf_path)
    else:
        # Unknown type - try to extract basic info and flag for attention
        account_number = extract_account_number(full_text) or "UNKNOWN"
        service_location = extract_service_location(full_text) or "UNKNOWN"

        return WaterBillData(
            document_type=DocumentType.UNKNOWN,
            account_number=account_number,
            service_location=service_location,
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
    else:
        # Default test paths
        test_paths = [
            "../../data/sample-bills/sample-bill.pdf",
            "../../data/sample-bills/sample-delinquency-notice.pdf",
        ]
        for path in test_paths:
            if Path(path).exists():
                print(f"\n{'='*60}")
                print(f"Parsing: {path}")
                print('='*60)
                result = parse_pdf(path)
                print(result.to_json())
