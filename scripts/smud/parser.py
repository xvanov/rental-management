"""PDF parser for SMUD (Sacramento Municipal Utility District) bills."""
import re
from datetime import datetime, date
from pathlib import Path
from typing import Optional
import pdfplumber

from models import SmudBillData, DocumentType


def parse_date(date_str: str) -> Optional[date]:
    """Parse date from various formats."""
    if not date_str:
        return None

    date_str = date_str.strip()

    # First, try to extract just the date portion from strings that may have
    # additional text after the date (e.g., "01/09/26 Rate: Time of Day")
    # Look for common date patterns: MM/DD/YY, MM/DD/YYYY
    date_pattern = re.match(r'^(\d{1,2}/\d{1,2}/\d{2,4})', date_str)
    if date_pattern:
        date_str = date_pattern.group(1)

    formats = [
        "%m/%d/%Y",
        "%m/%d/%y",
        "%Y-%m-%d",
        "%B %d, %Y",  # January 15, 2026
        "%b %d, %Y",  # Jan 15, 2026
        "%B %d %Y",   # January 15 2026
        "%b %d %Y",   # Jan 15 2026
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

    # Remove $ and commas
    cleaned = amount_str.strip().replace('$', '').replace(',', '')

    # Handle CR (credit)
    is_credit = 'CR' in amount_str.upper() or cleaned.startswith('-') or cleaned.startswith('(')
    cleaned = cleaned.replace('CR', '').replace('cr', '').replace('(', '').replace(')', '').strip()

    try:
        value = float(cleaned)
        return -value if is_credit and value > 0 else value
    except ValueError:
        return 0.0


def detect_document_type(text: str) -> DocumentType:
    """Detect if document is a regular bill or disconnect notice."""
    text_lower = text.lower()

    # Disconnect notice indicators
    disconnect_indicators = [
        "service will be disconnected",
        "disconnect notice",
        "final notice",
        "termination notice",
        "shutoff notice",
        "past due",
        "immediate payment required",
    ]

    # Bill indicators
    bill_indicators = [
        "your bill",
        "billing statement",
        "amount due",
        "electric service",
        "usage summary",
        "kwh",
        "kilowatt",
        "meter reading",
        "smud",
    ]

    disconnect_score = sum(1 for ind in disconnect_indicators if ind in text_lower)
    bill_score = sum(1 for ind in bill_indicators if ind in text_lower)

    if disconnect_score >= 2:
        return DocumentType.DISCONNECT_NOTICE
    elif bill_score >= 2:
        return DocumentType.BILL
    return DocumentType.UNKNOWN


def find_value_after_label(text: str, labels: list[str], stop_chars: str = "\n\t") -> Optional[str]:
    """Find the value that appears after any of the given labels."""
    text_lower = text.lower()

    for label in labels:
        label_lower = label.lower()
        idx = text_lower.find(label_lower)
        if idx != -1:
            # Move past the label
            start = idx + len(label)
            # Skip any colons, spaces
            while start < len(text) and text[start] in ': \t':
                start += 1
            # Find the end of the value
            end = start
            while end < len(text) and text[end] not in stop_chars:
                end += 1
            value = text[start:end].strip()
            if value:
                return value
    return None


def extract_number_sequence(text: str, length: int) -> Optional[str]:
    """Extract a sequence of exactly N consecutive digits from text."""
    current_digits = ""
    for char in text:
        if char.isdigit():
            current_digits += char
            if len(current_digits) == length:
                return current_digits
        else:
            if len(current_digits) == length:
                return current_digits
            current_digits = ""
    if len(current_digits) == length:
        return current_digits
    return None


def extract_account_number(text: str) -> Optional[str]:
    """Extract account number from text."""
    # Look for labeled account number first
    labels = ["Account Number", "Account #", "Account No", "Account:", "Acct #", "Acct:"]
    value = find_value_after_label(text, labels)
    if value:
        # Extract just the digits
        digits = ''.join(c for c in value if c.isdigit())
        if 7 <= len(digits) <= 10:
            return digits[:10]

    # Fallback: find any 7-digit sequence
    return extract_number_sequence(text, 7)


def extract_service_address(text: str) -> Optional[str]:
    """Extract service address from text."""
    street_suffixes = [
        ' ST', ' AVE', ' DR', ' CT', ' RD', ' LN', ' WAY', ' BLVD', ' CIR',
        ' STREET', ' AVENUE', ' DRIVE', ' COURT', ' ROAD', ' LANE', ' CIRCLE',
        ' PL', ' PLACE', ' TER', ' TERRACE', ' PKWY', ' PARKWAY',
    ]

    # Try to find labeled address first - SMUD uses "Location:"
    labels = ["Location:", "Location", "Service Address", "Service Location", "Property Address"]
    value = find_value_after_label(text, labels)
    if value:
        # Check if it looks like an address (starts with number)
        value_upper = value.upper()
        if value and value[0].isdigit():
            for suffix in street_suffixes:
                if suffix in value_upper:
                    idx = value_upper.find(suffix) + len(suffix)
                    return ' '.join(value[:idx].upper().split())

    # Fallback: scan lines for address patterns, but only in the first portion
    # of the document to avoid garbled payment stub text at the bottom
    lines = text.replace('\t', '\n').split('\n')
    # Only scan the first 40 lines (bill header area)
    for line in lines[:40]:
        line = line.strip()
        if not line or not line[0].isdigit():
            continue
        # Skip lines that look like garbled/doubled text (repeated chars)
        if _has_repeated_chars(line):
            continue
        line_upper = line.upper()
        for suffix in street_suffixes:
            if suffix in line_upper:
                idx = line_upper.find(suffix) + len(suffix)
                address = ' '.join(line[:idx].split())
                if len(address) > 5:
                    return address.upper()

    return None


def _has_repeated_chars(text: str) -> bool:
    """Check if text has suspicious repeated character patterns (garbled OCR text)."""
    # Check for doubled digits like "44117711" or doubled letters like "COOMMMMON"
    if len(text) < 8:
        return False

    # Check for alternating repeated pattern in the first 8 chars
    first_8 = text[:8]
    if all(first_8[i] == first_8[i+2] for i in range(0, 6, 2) if first_8[i].isdigit()):
        return True

    # Check for 3+ consecutive identical letters (like "MMM" or "OOO")
    for i in range(len(text) - 2):
        if text[i].isalpha() and text[i] == text[i+1] == text[i+2]:
            return True

    return False


def extract_date_from_text(text: str) -> Optional[date]:
    """Extract first date in MM/DD/YYYY format from text."""
    i = 0
    while i < len(text):
        if text[i].isdigit():
            date_str = ""
            j = i
            slash_count = 0
            while j < len(text) and (text[j].isdigit() or text[j] == '/'):
                if text[j] == '/':
                    slash_count += 1
                date_str += text[j]
                j += 1
                if slash_count == 2 and len(date_str) >= 8:
                    parsed = parse_date(date_str)
                    if parsed:
                        return parsed
                    break
            i = j
        else:
            i += 1
    return None


def extract_amount_after_label(text: str, labels: list[str]) -> float:
    """Extract dollar amount after a label."""
    value = find_value_after_label(text, labels, stop_chars="\n\t)")
    if value:
        return parse_amount(value)
    return 0.0


def extract_kwh_usage(text: str) -> float:
    """Extract kWh usage from text."""
    text_lower = text.lower()

    # Look for patterns like "XXX kWh" or "Usage: XXX"
    kwh_idx = text_lower.find('kwh')
    if kwh_idx != -1:
        # Look backward for the number
        end = kwh_idx
        while end > 0 and text[end-1] in ' \t':
            end -= 1
        start = end
        while start > 0 and (text[start-1].isdigit() or text[start-1] in ',.'):
            start -= 1
        if start < end:
            num_str = text[start:end].replace(',', '').strip()
            try:
                return float(num_str)
            except ValueError:
                pass

    # Try labeled version
    labels = ["Total Usage", "Usage:", "kWh Used", "Total kWh"]
    value = find_value_after_label(text, labels)
    if value:
        # Extract just the number
        num_str = ''.join(c for c in value if c.isdigit() or c in '.,')
        num_str = num_str.replace(',', '').rstrip('.')
        try:
            return float(num_str)
        except ValueError:
            pass

    return 0.0


def extract_billing_period(text: str) -> tuple[Optional[date], Optional[date], int]:
    """Extract billing period start, end, and number of days."""
    text_lower = text.lower()

    # Look for "from ... to ..." pattern
    from_idx = text_lower.find('from ')
    if from_idx != -1:
        to_idx = text_lower.find(' to ', from_idx)
        if to_idx != -1:
            # Extract the dates
            from_str = text[from_idx + 5:to_idx].strip()
            # Find end of the "to" date
            end_idx = to_idx + 4
            while end_idx < len(text) and text[end_idx] not in '\n\t(':
                end_idx += 1
            to_str = text[to_idx + 4:end_idx].strip()

            start_date = parse_date(from_str)
            end_date = parse_date(to_str)

            if start_date and end_date:
                days = (end_date - start_date).days
                return start_date, end_date, days

    # Look for "Billing Period:" or "Bill Period:" pattern (SMUD uses "Bill Period:")
    labels = ["Bill Period", "Billing Period", "Service Period"]
    value = find_value_after_label(text, labels)
    if value:
        # Try to find two dates separated by " to " or " - "
        for sep in [' to ', ' - ', '-']:
            if sep in value:
                parts = value.split(sep)
                if len(parts) >= 2:
                    # Clean up the end date part (may have "(XX Days)" suffix)
                    end_part = parts[1].strip()
                    # Remove parenthetical suffix like "(33 Days)"
                    paren_idx = end_part.find('(')
                    if paren_idx != -1:
                        end_part = end_part[:paren_idx].strip()
                    start_date = parse_date(parts[0].strip())
                    end_date = parse_date(end_part)
                    if start_date and end_date:
                        days = (end_date - start_date).days
                        return start_date, end_date, days

    # Try to find days separately
    days_labels = ["billing days", "service days", "days"]
    for label in days_labels:
        idx = text_lower.find(label)
        if idx != -1:
            # Look backward for the number
            end = idx
            while end > 0 and text[end-1] in ' \t':
                end -= 1
            start = end
            while start > 0 and text[start-1].isdigit():
                start -= 1
            if start < end:
                try:
                    days = int(text[start:end])
                    if 1 <= days <= 365:
                        return None, None, days
                except ValueError:
                    pass

    return None, None, 0


def extract_meter_number(text: str) -> Optional[str]:
    """Extract meter number from text."""
    labels = ["Meter #", "Meter Number", "Meter No", "Meter:"]
    value = find_value_after_label(text, labels)
    if value:
        # Take the first word/token
        parts = value.split()
        if parts:
            return parts[0]
    return None


def parse_regular_bill(text: str, pdf_path: str) -> SmudBillData:
    """Parse a regular SMUD bill PDF."""
    account_number = extract_account_number(text) or "UNKNOWN"
    service_address = extract_service_address(text) or "UNKNOWN"

    # Extract bill date - SMUD uses "Bill Issue Date:"
    bill_date = None
    bill_labels = ["Bill Issue Date", "Bill Date", "Statement Date", "Date of Bill"]
    value = find_value_after_label(text, bill_labels)
    if value:
        bill_date = parse_date(value)

    # Extract due date - SMUD uses "Current Charges, Due MM/DD/YY" or "Please pay by"
    due_date = None
    due_labels = ["Current Charges, Due", "Please pay by", "Due Date", "Payment Due", "Pay by", "Due:"]
    value = find_value_after_label(text, due_labels)
    if value:
        due_date = parse_date(value)

    # Extract amount due
    amount_labels = ["Amount Due", "Total Amount Due", "Total Due", "Current Balance", "Please Pay"]
    amount_due = extract_amount_after_label(text, amount_labels)

    # Extract billing period - SMUD uses "Bill Period: MM/DD/YY - MM/DD/YY (XX Days)"
    billing_start, billing_end, billing_days = extract_billing_period(text)

    # Extract kWh usage
    kwh_used = extract_kwh_usage(text)

    # Extract meter number
    meter_number = extract_meter_number(text)

    # Extract previous balance
    previous_balance = extract_amount_after_label(text, ["Previous Balance", "Previous Amount"])

    # Extract payments received
    payments_received = extract_amount_after_label(text, ["Payments Received", "Payment Received", "Payments:"])

    # Extract electric charges
    electric_charges = extract_amount_after_label(text, ["Electric Charges", "Current Charges", "Charges:"])

    # Extract taxes
    taxes = extract_amount_after_label(text, ["Taxes", "Tax", "Fees"])

    return SmudBillData(
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


def parse_disconnect_notice(text: str, pdf_path: str) -> SmudBillData:
    """Parse a disconnect notice PDF."""
    account_number = extract_account_number(text) or "UNKNOWN"
    service_address = extract_service_address(text) or "UNKNOWN"

    # Extract amount due
    amount_labels = ["Amount Due", "Balance Due", "Amount", "Balance"]
    amount_due = extract_amount_after_label(text, amount_labels)

    # Extract due/disconnect date
    due_labels = ["Due Date", "Disconnect Date", "Shutoff Date", "Disconnect By", "Pay By"]
    due_date = None
    value = find_value_after_label(text, due_labels)
    if value:
        due_date = parse_date(value)

    # Bill date
    bill_labels = ["Notice Date", "Statement Date"]
    bill_date = None
    value = find_value_after_label(text, bill_labels)
    if value:
        bill_date = parse_date(value)

    return SmudBillData(
        document_type=DocumentType.DISCONNECT_NOTICE,
        account_number=account_number,
        service_address=service_address,
        bill_date=bill_date,
        due_date=due_date,
        amount_due=amount_due,
        requires_attention=True,
        attention_reason="DISCONNECT NOTICE - Immediate payment required",
        pdf_path=pdf_path,
        raw_text=text[:500],
    )


def parse_pdf(pdf_path: str) -> SmudBillData:
    """
    Parse a SMUD PDF and extract bill data.

    Args:
        pdf_path: Path to the PDF file

    Returns:
        SmudBillData with extracted information
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
        return SmudBillData(
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

        return SmudBillData(
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
        print("Usage: python parser.py <path_to_pdf>")
