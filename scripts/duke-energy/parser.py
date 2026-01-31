"""PDF parser for Duke Energy utility bills."""
import re
from datetime import datetime, date
from pathlib import Path
from typing import Optional
import pdfplumber

from models import EnergyBillData, DocumentType


def parse_date(date_str: str, reference_year: int = None) -> Optional[date]:
    """Parse date from various formats."""
    if not date_str:
        return None

    date_str = date_str.strip()

    # Handle "Month DD" format (no year) - common in Duke Energy bills
    month_day_match = re.match(r'([A-Za-z]{3})\s+(\d{1,2})$', date_str)
    if month_day_match and reference_year:
        try:
            month_name = month_day_match.group(1)
            day = int(month_day_match.group(2))
            # Parse month name
            month_num = datetime.strptime(month_name, "%b").month
            return date(reference_year, month_num, day)
        except ValueError:
            pass

    formats = [
        "%b %d, %Y",      # Dec 31, 2025
        "%B %d, %Y",      # December 31, 2025
        "%m/%d/%Y",       # 12/31/2025
        "%m/%d/%y",       # 12/31/25
        "%Y-%m-%d",       # 2025-12-31
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
    # Handle negative amounts like -71.47
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def detect_document_type(text: str) -> DocumentType:
    """Detect if document is a regular bill or disconnect notice."""
    text_lower = text.lower()

    # Disconnect notice indicators
    disconnect_indicators = [
        "disconnection notice",
        "service will be disconnected",
        "past due",
        "final notice",
        "disconnect date",
    ]

    # Regular bill indicators
    bill_indicators = [
        "your energy bill",
        "duke energy",
        "billing summary",
        "energy used",
        "current electric charges",
        "total amount due",
    ]

    disconnect_score = sum(1 for ind in disconnect_indicators if ind in text_lower)
    bill_score = sum(1 for ind in bill_indicators if ind in text_lower)

    if disconnect_score >= 2:
        return DocumentType.DISCONNECT_NOTICE
    elif bill_score >= 2:
        return DocumentType.BILL
    return DocumentType.UNKNOWN


def extract_account_number(text: str) -> Optional[str]:
    """Extract account number from text."""
    patterns = [
        r'Account\s*number\s*(\d[\d\s]{10,14}\d)',  # Account number 9101 7650 0588
        r'(\d{4}\s?\d{4}\s?\d{4})',  # 9101 7650 0588 format
        r'Account\s*#?\s*:?\s*(\d{10,14})',  # Account# 910176500588
    ]

    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            # Remove spaces from account number
            return re.sub(r'\s+', '', match.group(1))
    return None


def extract_service_address(text: str) -> Optional[str]:
    """Extract service address from text."""
    # Look for "Service address" section
    patterns = [
        # Service address followed by name and address on next lines
        r'Service\s+address[^\n]*\n([A-Z][A-Z\s]+)\n(\d+\s+[A-Z0-9\s]+(?:WAY|ST|AVE|DR|CT|RD|LN|BLVD|PL))\n([A-Z]+\s+[A-Z]{2}\s+\d{5})',
        # Just the street address line
        r'(\d+\s+[A-Z0-9]+(?:\s+[A-Z0-9]+)*\s+(?:WAY|ST|AVE|DR|CT|RD|LN|BLVD|PL))\s*\n\s*([A-Z]+\s+[A-Z]{2}\s+\d{5})',
    ]

    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
        if match:
            groups = match.groups()
            if len(groups) >= 3:
                # Full match with name, street, city/state/zip
                street = groups[1].strip()
                city_state_zip = groups[2].strip()
                return f"{street}, {city_state_zip}"
            elif len(groups) >= 2:
                street = groups[0].strip()
                city_state_zip = groups[1].strip()
                return f"{street}, {city_state_zip}"

    # Fallback: look for common NC address pattern
    address_match = re.search(
        r'(\d+\s+[A-Z0-9]+(?:\s+[A-Z0-9]+)*\s+(?:WAY|ST|AVE|DR|CT|RD|LN|BLVD|PL))',
        text, re.IGNORECASE
    )
    if address_match:
        return address_match.group(1).strip()

    return None


def parse_regular_bill(text: str, pdf_path: str) -> EnergyBillData:
    """Parse a regular Duke Energy bill PDF."""
    account_number = extract_account_number(text) or "UNKNOWN"
    service_address = extract_service_address(text) or "UNKNOWN"

    # Extract bill date (e.g., "Bill date Dec 31, 2025")
    bill_date = None
    bill_date_match = re.search(r'Bill\s+date\s+([A-Za-z]{3}\s+\d{1,2},?\s+\d{4})', text, re.IGNORECASE)
    if bill_date_match:
        bill_date = parse_date(bill_date_match.group(1))

    # Get reference year for dates without year
    reference_year = bill_date.year if bill_date else datetime.now().year

    # Extract due date (e.g., "Total Amount Due Jan 26" or "by Jan 26")
    due_date = None
    due_patterns = [
        r'Total\s+Amount\s+Due\s+([A-Za-z]{3}\s+\d{1,2})',
        r'by\s+([A-Za-z]{3}\s+\d{1,2})',
        r'Due\s+([A-Za-z]{3}\s+\d{1,2},?\s+\d{4})',
    ]
    for pattern in due_patterns:
        due_match = re.search(pattern, text, re.IGNORECASE)
        if due_match:
            due_str = due_match.group(1)
            # If due date is before bill date month, it's next year
            due_date = parse_date(due_str, reference_year)
            if due_date and bill_date and due_date < bill_date:
                due_date = parse_date(due_str, reference_year + 1)
            if due_date:
                break

    # Extract amount due (e.g., "Total Amount Due Jan 26 $140.14")
    amount_due = 0.0
    amount_patterns = [
        r'Total\s+Amount\s+Due[^\$]*\$\s*([\d,]+\.?\d*)',
        r'\$\s*([\d,]+\.?\d*)\s*$',  # Amount at end of "Total Amount Due" line
    ]
    for pattern in amount_patterns:
        amount_match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
        if amount_match:
            amount_due = parse_amount(amount_match.group(1))
            if amount_due > 0:
                break

    # Extract billing period (e.g., "For service Nov 26 - Dec 29" or "34 days")
    billing_start = None
    billing_end = None
    billing_days = 0

    period_match = re.search(
        r'For\s+service\s+([A-Za-z]{3}\s+\d{1,2})\s*-\s*([A-Za-z]{3}\s+\d{1,2})',
        text, re.IGNORECASE
    )
    if period_match:
        start_str = period_match.group(1)
        end_str = period_match.group(2)
        billing_end = parse_date(end_str, reference_year)
        # Start might be in previous year if it's after end month
        billing_start = parse_date(start_str, reference_year)
        if billing_start and billing_end and billing_start > billing_end:
            billing_start = parse_date(start_str, reference_year - 1)

    # Also try "Billing Period - Nov 26 25 to Dec 29 25" format
    if not billing_start:
        period_match2 = re.search(
            r'Billing\s+Period\s*-?\s*([A-Za-z]{3}\s+\d{1,2}\s+\d{2,4})\s+to\s+([A-Za-z]{3}\s+\d{1,2}\s+\d{2,4})',
            text, re.IGNORECASE
        )
        if period_match2:
            # Handle "Nov 26 25" format
            start_str = period_match2.group(1)
            end_str = period_match2.group(2)
            # Convert "Nov 26 25" to "Nov 26, 2025"
            start_str = re.sub(r'(\d{1,2})\s+(\d{2})$', r'\1, 20\2', start_str)
            end_str = re.sub(r'(\d{1,2})\s+(\d{2})$', r'\1, 20\2', end_str)
            billing_start = parse_date(start_str)
            billing_end = parse_date(end_str)

    days_match = re.search(r'(\d+)\s*days', text, re.IGNORECASE)
    if days_match:
        billing_days = int(days_match.group(1))

    # Extract kWh used
    kwh_used = 0.0
    kwh_patterns = [
        r'Energy\s+Used\s*([\d,]+\.?\d*)\s*kWh',
        r'Billed\s+kWh\s*([\d,]+\.?\d*)',
        r'([\d,]+\.?\d*)\s*kWh',
    ]
    for pattern in kwh_patterns:
        kwh_match = re.search(pattern, text, re.IGNORECASE)
        if kwh_match:
            try:
                kwh_used = float(kwh_match.group(1).replace(',', ''))
                if kwh_used > 0:
                    break
            except ValueError:
                continue

    # Extract meter number
    meter_number = None
    meter_match = re.search(r'[Mm]eter\s*(?:number|#|-)?\s*(\d{6,12})', text)
    if meter_match:
        meter_number = meter_match.group(1)

    # Extract charge breakdown
    electric_charges = 0.0
    charges_match = re.search(r'(?:Current\s+)?Electric\s+Charges?\s*\$?([\d,]+\.?\d*)', text, re.IGNORECASE)
    if charges_match:
        electric_charges = parse_amount(charges_match.group(1))

    # Try "Total Current Charges"
    if electric_charges == 0:
        total_charges_match = re.search(r'Total\s+Current\s+Charges\s*\$?([\d,]+\.?\d*)', text, re.IGNORECASE)
        if total_charges_match:
            electric_charges = parse_amount(total_charges_match.group(1))

    taxes = 0.0
    taxes_patterns = [
        r'Taxes\s*\$?([\d,]+\.?\d*)',
        r'Total\s+Taxes\s*\$?([\d,]+\.?\d*)',
        r'Sales\s+Tax[^\$]*\$?([\d,]+\.?\d*)',
    ]
    for pattern in taxes_patterns:
        taxes_match = re.search(pattern, text, re.IGNORECASE)
        if taxes_match:
            taxes = parse_amount(taxes_match.group(1))
            if taxes > 0:
                break

    previous_balance = 0.0
    prev_match = re.search(r'Previous\s+(?:Amount\s+)?(?:Due|Balance)\s*\$?([\d,]+\.?\d*)', text, re.IGNORECASE)
    if prev_match:
        previous_balance = parse_amount(prev_match.group(1))

    payments_received = 0.0
    payment_match = re.search(r'Payment\s+Received[^\$-]*[-\$]?\s*([\d,]+\.?\d*)', text, re.IGNORECASE)
    if payment_match:
        payments_received = parse_amount(payment_match.group(1))

    return EnergyBillData(
        document_type=DocumentType.BILL,
        account_number=account_number,
        service_address=service_address,
        bill_date=bill_date,
        due_date=due_date,
        amount_due=amount_due,
        billing_period_start=billing_start,
        billing_period_end=billing_end,
        billing_days=billing_days,
        kwh_used=kwh_used,
        meter_number=meter_number,
        electric_charges=electric_charges,
        taxes=taxes,
        previous_balance=previous_balance,
        payments_received=payments_received,
        requires_attention=False,
        pdf_path=pdf_path,
        raw_text=text[:500],
    )


def parse_disconnect_notice(text: str, pdf_path: str) -> EnergyBillData:
    """Parse a disconnect notice PDF."""
    account_number = extract_account_number(text) or "UNKNOWN"
    service_address = extract_service_address(text) or "UNKNOWN"

    # Extract amount due
    amount_due = 0.0
    amount_match = re.search(r'(?:Amount|Balance)\s+(?:Due|Owed)[^\$]*\$?([\d,]+\.?\d*)', text, re.IGNORECASE)
    if amount_match:
        amount_due = parse_amount(amount_match.group(1))

    # Extract disconnect date
    disconnect_date = None
    disconnect_match = re.search(r'[Dd]isconnect(?:ion)?\s+[Dd]ate[:\s]+([A-Za-z]+\s+\d{1,2},?\s+\d{4})', text)
    if disconnect_match:
        disconnect_date = parse_date(disconnect_match.group(1))

    return EnergyBillData(
        document_type=DocumentType.DISCONNECT_NOTICE,
        account_number=account_number,
        service_address=service_address,
        amount_due=amount_due,
        due_date=disconnect_date,
        requires_attention=True,
        attention_reason="DISCONNECT NOTICE - Service disconnection pending",
        pdf_path=pdf_path,
        raw_text=text[:500],
    )


def parse_pdf(pdf_path: str) -> EnergyBillData:
    """
    Parse a Duke Energy utility PDF and extract bill data.

    Args:
        pdf_path: Path to the PDF file

    Returns:
        EnergyBillData with extracted information
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
        return EnergyBillData(
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
        # Unknown type - try to extract basic info and flag for attention
        account_number = extract_account_number(full_text) or "UNKNOWN"
        service_address = extract_service_address(full_text) or "UNKNOWN"

        return EnergyBillData(
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
        # Default test paths
        test_paths = [
            "../../data/sample-bills/duke-energy-sample.pdf",
        ]
        for path in test_paths:
            if Path(path).exists():
                print(f"\n{'='*60}")
                print(f"Parsing: {path}")
                print('='*60)
                result = parse_pdf(path)
                print(result.to_json())
