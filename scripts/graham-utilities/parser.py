"""PDF parser for Graham Utilities bills (City of Graham via Edmunds WIPP)."""
import re
from datetime import datetime, date
from pathlib import Path
from typing import Optional
import pdfplumber

from models import GrahamBillData, DocumentType


def parse_date(date_str: str) -> Optional[date]:
    """Parse date from various formats."""
    if not date_str:
        return None

    date_str = date_str.strip()
    formats = [
        "%m/%d/%y",
        "%m/%d/%Y",
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
        "service will be disconnected",
        "disconnect notice",
        "final notice",
        "past due",
        "payment has not been received",
        "water shutoff",
        "service termination",
    ]

    # Bill indicators
    bill_indicators = [
        "current charges detail",
        "current meter activity",
        "billing period",
        "amount due",
        "payment coupon",
        "city of graham",
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
    # Graham format: "50530-17 PIN: 4788" or "ACCOUNT NO: 50530-17"
    patterns = [
        r'ACCOUNT\s*(?:NO)?:?\s*(\d{5}-\d{2})',
        r'(\d{5}-\d{2})\s+PIN:',
        r'(\d{5}-\d{2})',
    ]

    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1)
    return None


def extract_service_location(text: str) -> Optional[str]:
    """Extract service address from text."""
    # Look for LOCATION: pattern - the address immediately follows
    # Example: "LOCATION: 417 NORTH ST"
    patterns = [
        # Match LOCATION: followed by address up to known stop words
        r'LOCATION:\s*(\d+\s+[A-Z0-9\s]+?(?:ST|AVE|DR|CT|RD|LN|WAY|BLVD|PL|STREET|AVENUE|DRIVE|COURT|ROAD|LANE)(?:\s+[A-Z])?)\s*(?:BILLING|PREVIOUS|DUE|$|\n)',
        r'LOCATION:\s*(\d+\s+\w+(?:\s+\w+)*\s+(?:ST|AVE|DR|CT|RD|LN|WAY|BLVD|PL))',
    ]

    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            addr = match.group(1).strip()
            # Clean up - remove extra whitespace
            addr = re.sub(r'\s+', ' ', addr)
            return addr

    return None


def parse_regular_bill(text: str, pdf_path: str) -> GrahamBillData:
    """Parse a regular Graham utility bill PDF."""
    account_number = extract_account_number(text) or "UNKNOWN"
    service_location = extract_service_location(text) or "UNKNOWN"

    # Extract billing date
    bill_date = None
    bill_date_patterns = [
        r'BILLING\s*DATE:\s*(\d{1,2}/\d{1,2}/\d{2,4})',
    ]
    for pattern in bill_date_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            bill_date = parse_date(match.group(1))
            break

    # Extract due date
    due_date = None
    due_date_patterns = [
        r'DUE\s*DATE:\s*(\d{1,2}/\d{1,2}/\d{2,4})',
    ]
    for pattern in due_date_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            due_date = parse_date(match.group(1))
            break

    # Extract amount due / total due
    amount_due = 0.0
    amount_patterns = [
        r'TOTAL\s*DUE:\s*\$?([\d,]+\.?\d*)',
        r'AMOUNT\s*DUE[:\s]*\$?([\d,]+\.?\d*)',
    ]
    for pattern in amount_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            amount_due = parse_amount(match.group(1))
            break

    # Extract billing period
    billing_start = None
    billing_end = None
    period_match = re.search(
        r'BILLING\s*PERIOD:\s*(\d{1,2}/\d{1,2}/\d{2,4})\s*to\s*(\d{1,2}/\d{1,2}/\d{2,4})',
        text, re.IGNORECASE
    )
    if period_match:
        billing_start = parse_date(period_match.group(1))
        billing_end = parse_date(period_match.group(2))

    # Extract previous balance
    previous_balance = 0.0
    prev_balance_match = re.search(r'PREVIOUS\s*BALANCE:\s*\$?([\d,]+\.?\d*)', text, re.IGNORECASE)
    if prev_balance_match:
        previous_balance = parse_amount(prev_balance_match.group(1))

    # Extract current charges
    current_charges = 0.0
    current_charges_match = re.search(r'CURRENT\s*CHARGES:\s*\$?([\d,]+\.?\d*)', text, re.IGNORECASE)
    if current_charges_match:
        current_charges = parse_amount(current_charges_match.group(1))

    # Extract charge breakdown from CURRENT CHARGES DETAIL table
    # Format: DESCRIPTION UNITS FLAT USAGE TOTAL
    water_charges = 0.0
    sewer_charges = 0.0
    stormwater_charges = 0.0
    refuse_charges = 0.0
    recycling_charges = 0.0

    # Water Residential In
    water_match = re.search(r'WATER\s+Residential\s+In[^\d]*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)', text, re.IGNORECASE)
    if water_match:
        water_charges = parse_amount(water_match.group(4))  # TOTAL column

    # Sewer Monthly Inside
    sewer_match = re.search(r'SEWER\s+MONTHLY\s+INSIDE[^\d]*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)', text, re.IGNORECASE)
    if sewer_match:
        sewer_charges = parse_amount(sewer_match.group(4))  # TOTAL column

    # Stormwater Res.
    stormwater_match = re.search(r'Stormwater\s+Res\.[^\d]*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)', text, re.IGNORECASE)
    if stormwater_match:
        stormwater_charges = parse_amount(stormwater_match.group(4))  # TOTAL column

    # Refuse Fee Monthly
    refuse_match = re.search(r'REFUSE\s+FEE\s+MONTHLY[^\d]*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)', text, re.IGNORECASE)
    if refuse_match:
        refuse_charges = parse_amount(refuse_match.group(4))  # TOTAL column

    # Recycling Fee Monthly
    recycling_match = re.search(r'RECYCLING\s+FEE\s+MONTHL?Y?[^\d]*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)', text, re.IGNORECASE)
    if recycling_match:
        recycling_charges = parse_amount(recycling_match.group(4))  # TOTAL column

    # Extract meter readings
    previous_reading = 0
    current_reading = 0
    usage = 0

    # Format: WATER 12/14/25 87236 01/14/26 91883 4647
    meter_match = re.search(
        r'WATER\s+(\d{1,2}/\d{1,2}/\d{2,4})\s+(\d+)\s+(\d{1,2}/\d{1,2}/\d{2,4})\s+(\d+)\s+(\d+)',
        text, re.IGNORECASE
    )
    if meter_match:
        previous_reading = int(meter_match.group(2))
        current_reading = int(meter_match.group(4))
        usage = int(meter_match.group(5))

    return GrahamBillData(
        document_type=DocumentType.BILL,
        account_number=account_number,
        service_location=service_location,
        bill_date=bill_date,
        due_date=due_date,
        amount_due=amount_due,
        billing_period_start=billing_start,
        billing_period_end=billing_end,
        previous_balance=previous_balance,
        current_charges=current_charges,
        water_charges=water_charges,
        sewer_charges=sewer_charges,
        stormwater_charges=stormwater_charges,
        refuse_charges=refuse_charges,
        recycling_charges=recycling_charges,
        previous_reading=previous_reading,
        current_reading=current_reading,
        usage=usage,
        requires_attention=False,
        pdf_path=pdf_path,
        raw_text=text[:500],
    )


def parse_delinquency_notice(text: str, pdf_path: str) -> GrahamBillData:
    """Parse a delinquency/disconnect notice PDF."""
    account_number = extract_account_number(text) or "UNKNOWN"
    service_location = extract_service_location(text) or "UNKNOWN"

    # Extract amount due
    amount_due = 0.0
    amount_match = re.search(r'(?:TOTAL|AMOUNT)\s*DUE:?\s*\$?([\d,]+\.?\d*)', text, re.IGNORECASE)
    if amount_match:
        amount_due = parse_amount(amount_match.group(1))

    # Extract disconnect date
    disconnect_date = None
    disconnect_match = re.search(r'(?:disconnect|termination)\s*date:?\s*(\d{1,2}/\d{1,2}/\d{2,4})', text, re.IGNORECASE)
    if disconnect_match:
        disconnect_date = parse_date(disconnect_match.group(1))

    # Extract last day to pay
    last_day = None
    last_day_match = re.search(r'last\s*day\s*to\s*pay[^:]*:?\s*(\d{1,2}/\d{1,2}/\d{2,4})', text, re.IGNORECASE)
    if last_day_match:
        last_day = parse_date(last_day_match.group(1))

    # Notice date as bill date
    bill_date = None
    date_match = re.search(r'BILLING\s*DATE:\s*(\d{1,2}/\d{1,2}/\d{2,4})', text, re.IGNORECASE)
    if date_match:
        bill_date = parse_date(date_match.group(1))

    return GrahamBillData(
        document_type=DocumentType.DELINQUENCY_NOTICE,
        account_number=account_number,
        service_location=service_location,
        bill_date=bill_date,
        due_date=last_day or disconnect_date,
        amount_due=amount_due,
        disconnect_date=disconnect_date,
        last_day_to_pay=last_day,
        requires_attention=True,
        attention_reason="DELINQUENCY NOTICE - Service disconnection pending",
        pdf_path=pdf_path,
        raw_text=text[:500],
    )


def parse_pdf(pdf_path: str) -> GrahamBillData:
    """
    Parse a Graham utility PDF and extract bill data.

    Args:
        pdf_path: Path to the PDF file

    Returns:
        GrahamBillData with extracted information
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
        return GrahamBillData(
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

        return GrahamBillData(
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
        print(f"\n{'='*60}")
        print(f"Parsing: {pdf_path}")
        print('='*60)
        result = parse_pdf(pdf_path)
        print(result.to_json())
    else:
        print("Usage: python parser.py <path_to_pdf>")
