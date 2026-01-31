"""PDF parser for Wake Electric utility bills."""
import re
from datetime import datetime, date
from pathlib import Path
from typing import Optional
import pdfplumber

from models import EnergyBillData, DocumentType


def parse_date(date_str: str) -> Optional[date]:
    """Parse date from various formats."""
    if not date_str:
        return None

    date_str = date_str.strip()

    formats = [
        "%m/%d/%Y",       # 01/09/2026
        "%m/%d/%y",       # 01/09/26
        "%Y-%m-%d",       # 2026-01-09
        "%b %d, %Y",      # Jan 09, 2026
        "%B %d, %Y",      # January 09, 2026
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
    # Handle negative amounts like -107.51
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def detect_document_type(text: str) -> DocumentType:
    """Detect if document is a regular bill or disconnect notice."""
    text_lower = text.lower()

    # Check for BILL TYPE field - this is definitive
    if 'bill type' in text_lower and 'normal' in text_lower:
        return DocumentType.BILL

    # Disconnect notice indicators - must be explicit, not just informational
    # Note: "if your bill shows a disconnect notice" is informational text, not an actual notice
    disconnect_indicators = [
        "disconnection notice",  # As a header/title
        "your service will be disconnected",
        "amount past due",
        "final notice before disconnect",
        "scheduled for disconnection",
    ]

    # Regular bill indicators
    bill_indicators = [
        "current charges due by",
        "energy used",
        "facility charge",
        "kwh usage history",
        "meter reading",
        "residential",
        "billing period",
    ]

    # Count indicators, but ignore informational text about disconnect notices
    disconnect_score = 0
    for ind in disconnect_indicators:
        if ind in text_lower:
            # Make sure it's not in an informational context
            if "if your bill shows" not in text_lower[:text_lower.find(ind)+50]:
                disconnect_score += 1

    bill_score = sum(1 for ind in bill_indicators if ind in text_lower)

    if disconnect_score >= 2:
        return DocumentType.DISCONNECT_NOTICE
    elif bill_score >= 2:
        return DocumentType.BILL
    return DocumentType.UNKNOWN


def extract_account_number(text: str) -> Optional[str]:
    """Extract account number from text."""
    patterns = [
        r'ACCOUNT\s*NUMBER\s*(\d{10})',  # ACCOUNT NUMBER 1052436902
        r'Account\s*Number\s*(\d{10})',
        r'(\d{10})\s*$',  # 10-digit number at end of line
    ]

    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
        if match:
            return match.group(1)
    return None


def extract_service_address(text: str) -> Optional[str]:
    """Extract service address from text."""
    # Look for SERVICE LOCATION pattern - Wake Electric format: "UNDERBRUSH DR 1553"
    # This appears on the same line as BILL DATE, etc.
    patterns = [
        # SERVICE LOCATION followed by street name and number
        r'SERVICE\s+LOCATION\s+([A-Z]+(?:\s+[A-Z]+)*\s+(?:DR|ST|AVE|RD|CT|LN|BLVD|WAY|PL|CIR)\s+\d+)',
        # Try with number at start too
        r'SERVICE\s+LOCATION\s+(\d+\s+[A-Z]+(?:\s+[A-Z]+)*\s+(?:DR|ST|AVE|RD|CT|LN|BLVD|WAY|PL|CIR))',
    ]

    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            addr = match.group(1).strip()
            # Normalize to standard format: number then street
            # Wake Electric shows "UNDERBRUSH DR 1553" - need to flip it
            parts = addr.split()
            if parts and parts[-1].isdigit():
                # Number is at the end, move it to front
                number = parts[-1]
                street = ' '.join(parts[:-1])
                return f"{number} {street}"
            return addr

    # Fallback: look for address in mailing section (e.g., "1553 UNDERBRUSH DR\nDURHAM NC 27703")
    mailing_match = re.search(
        r'(\d+\s+[A-Z]+(?:\s+[A-Z]+)*\s+(?:DR|ST|AVE|RD|CT|LN|BLVD|WAY|PL|CIR))\s*\n\s*([A-Z]+\s+NC\s+\d{5})',
        text, re.IGNORECASE
    )
    if mailing_match:
        return f"{mailing_match.group(1).strip()}, {mailing_match.group(2).strip()}"

    return None


def extract_account_bill_location(text: str) -> tuple[Optional[str], Optional[date], Optional[str]]:
    """
    Extract account number, bill date, and service location from the data row.
    Wake Electric format:
    Header: ACCOUNT NUMBER BILL DATE SERVICE LOCATION WPCA BILL TYPE TELEPHONE
    Data:   1052436902     01/09/2026 UNDERBRUSH DR 1553 0.000 NORMAL (213) 293-2712
    """
    # Pattern for the data row: account (10 digits), date, street name + type + number
    pattern = r'(\d{10})\s+(\d{2}/\d{2}/\d{4})\s+([A-Z]+(?:\s+[A-Z]+)*\s+(?:DR|ST|AVE|RD|CT|LN|BLVD|WAY|PL|CIR)\s+\d+)'
    match = re.search(pattern, text, re.IGNORECASE)
    if match:
        account = match.group(1)
        bill_dt = parse_date(match.group(2))
        # Normalize address: "UNDERBRUSH DR 1553" -> "1553 UNDERBRUSH DR"
        addr = match.group(3).strip()
        parts = addr.split()
        if parts and parts[-1].isdigit():
            number = parts[-1]
            street = ' '.join(parts[:-1])
            addr = f"{number} {street}"
        return account, bill_dt, addr
    return None, None, None


def parse_regular_bill(text: str, pdf_path: str) -> EnergyBillData:
    """Parse a regular Wake Electric bill PDF."""
    # Extract account, bill date, and service location from the data row
    account_number, bill_date, service_address = extract_account_bill_location(text)

    # Fallback to individual extractors if needed
    if not account_number:
        account_number = extract_account_number(text) or "UNKNOWN"
    if not service_address:
        service_address = extract_service_address(text) or "UNKNOWN"

    # Bill date fallback
    if not bill_date:
        bill_date_match = re.search(r'BILL\s+DATE\s+(\d{2}/\d{2}/\d{4})', text, re.IGNORECASE)
        if bill_date_match:
            bill_date = parse_date(bill_date_match.group(1))

    # Extract due date (e.g., "CURRENT CHARGES DUE BY 02/04/2026")
    due_date = None
    due_patterns = [
        r'CURRENT\s+CHARGES\s+DUE\s+BY\s+(\d{2}/\d{2}/\d{4})',
        r'DUE\s+BY\s+(\d{2}/\d{2}/\d{4})',
        r'BANK\s+DRAFTED\s+ON\s+(\d{2}/\d{2}/\d{4})',
    ]
    for pattern in due_patterns:
        due_match = re.search(pattern, text, re.IGNORECASE)
        if due_match:
            due_date = parse_date(due_match.group(1))
            if due_date:
                break

    # Extract billing period (e.g., "FROM TO ... 12/05/2025 01/05/2026")
    billing_start = None
    billing_end = None
    billing_days = 0

    # Pattern for FROM TO dates and days
    period_match = re.search(
        r'FROM\s+TO\s+.*?(\d{2}/\d{2}/\d{4})\s+(\d{2}/\d{2}/\d{4})\s+(\d+)',
        text, re.IGNORECASE | re.DOTALL
    )
    if period_match:
        billing_start = parse_date(period_match.group(1))
        billing_end = parse_date(period_match.group(2))
        billing_days = int(period_match.group(3))

    # Alternative: look for date range with days in between
    if not billing_start:
        alt_match = re.search(
            r'(\d{2}/\d{2}/\d{4})\s+(\d{2}/\d{2}/\d{4})\s+(\d+)\s+\d+',
            text
        )
        if alt_match:
            billing_start = parse_date(alt_match.group(1))
            billing_end = parse_date(alt_match.group(2))
            billing_days = int(alt_match.group(3))

    # Extract amount due (e.g., "CURRENT CHARGES DUE BY 02/04/2026 135.80")
    amount_due = 0.0
    amount_patterns = [
        r'CURRENT\s+CHARGES\s+DUE\s+BY\s+\d{2}/\d{2}/\d{4}\s+([\d,]+\.?\d*)',
        r'BANK\s+DRAFTED\s+ON\s+\d{2}/\d{2}/\d{4}\s+([\d,]+\.?\d*)',
    ]
    for pattern in amount_patterns:
        amount_match = re.search(pattern, text, re.IGNORECASE)
        if amount_match:
            amount_due = parse_amount(amount_match.group(1))
            if amount_due > 0:
                break

    # Extract kWh used (e.g., "KWH USAGE ... 784")
    kwh_used = 0.0
    kwh_patterns = [
        r'KWH\s+USAGE\s+.*?(\d+)',  # KWH USAGE column
        r'RESIDENTIAL\s+[\d.]+\s+(\d+)',  # After RESIDENTIAL rate
        r'(\d+)\s+0\.000\s*$',  # kWh before demand (0.000)
    ]
    for pattern in kwh_patterns:
        kwh_match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
        if kwh_match:
            try:
                kwh_used = float(kwh_match.group(1))
                if kwh_used > 0:
                    break
            except ValueError:
                continue

    # Extract meter number (e.g., "NUMBER ... 67783" in the meter reading section)
    meter_number = None
    # Wake Electric format: "DAYS NUMBER PREVIOUS PRESENT" header, then data row with meter number
    # Data looks like: "12/05/2025 01/05/2026 31 67783 6818 7602 RESIDENTIAL"
    meter_match = re.search(
        r'\d{2}/\d{2}/\d{4}\s+\d{2}/\d{2}/\d{4}\s+\d+\s+(\d{5})\s+\d+\s+\d+\s+RESIDENTIAL',
        text, re.IGNORECASE
    )
    if meter_match:
        meter_number = meter_match.group(1)

    # Extract charge breakdown
    energy_charge = 0.0
    energy_match = re.search(r'ENERGY\s+USED\s+([\d,]+\.?\d*)', text, re.IGNORECASE)
    if energy_match:
        energy_charge = parse_amount(energy_match.group(1))

    facility_charge = 0.0
    facility_match = re.search(r'FACILITY\s+CHARGE\s+([\d,]+\.?\d*)', text, re.IGNORECASE)
    if facility_match:
        facility_charge = parse_amount(facility_match.group(1))

    taxes = 0.0
    taxes_patterns = [
        r'STATE\s+SALES\s+TAX\s+([\d,]+\.?\d*)',
        r'SALES\s+TAX\s+([\d,]+\.?\d*)',
        r'TAX\s+([\d,]+\.?\d*)',
    ]
    for pattern in taxes_patterns:
        taxes_match = re.search(pattern, text, re.IGNORECASE)
        if taxes_match:
            taxes = parse_amount(taxes_match.group(1))
            if taxes > 0:
                break

    previous_balance = 0.0
    prev_patterns = [
        r'PREVIOUS\s+BALANCE\s+([\d,]+\.?\d*)',
        r'PRIOR\s+BALANCE\s+([\d,]+\.?\d*)',
    ]
    for pattern in prev_patterns:
        prev_match = re.search(pattern, text, re.IGNORECASE)
        if prev_match:
            previous_balance = parse_amount(prev_match.group(1))
            if previous_balance > 0:
                break

    payments_received = 0.0
    payment_match = re.search(r'PAYMENT\s+THANK\s+YOU\s+[-]?([\d,]+\.?\d*)', text, re.IGNORECASE)
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
        energy_charge=energy_charge,
        facility_charge=facility_charge,
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
    amount_match = re.search(r'(?:Amount|Balance)\s+(?:Due|Owed)[^\d]*([\d,]+\.?\d*)', text, re.IGNORECASE)
    if amount_match:
        amount_due = parse_amount(amount_match.group(1))

    # Extract disconnect date
    disconnect_date = None
    disconnect_match = re.search(r'[Dd]isconnect(?:ion)?\s+[Dd]ate[:\s]+(\d{2}/\d{2}/\d{4})', text)
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
    Parse a Wake Electric utility PDF and extract bill data.

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
        print("Usage: python parser.py <pdf_path>")
