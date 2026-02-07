"""
Standardized bill storage utilities for Python scrapers.

All utility bills are stored in:
  data/bills/{address-slug}/{provider}_{YYYY-MM}.pdf

Example:
  data/bills/3606-appling-way/duke-energy_2026-01.pdf
  data/bills/118-king-arthur-ct/enbridge-gas_2026-01.pdf
"""

import os
import re
from datetime import datetime
from pathlib import Path
from typing import Optional


def get_project_root() -> Path:
    """Get the project root directory."""
    # Go up from scripts/lib to project root
    return Path(__file__).parent.parent.parent


def get_bills_directory() -> Path:
    """Get the base bills directory."""
    return get_project_root() / "data" / "bills"


def address_to_slug(address: str) -> str:
    """
    Convert an address to a URL-safe slug.
    "3606 APPLING WAY, DURHAM NC 27703" -> "3606-appling-way"
    "310B HOWARD ST" -> "310b-howard-st"
    "310 HOWARD ST B" -> "310b-howard-st"
    """
    # Take just the street address (before city/state/zip)
    street_address = address.split(",")[0].strip()

    # Remove unit designations for the folder (keep it simple)
    street_address = re.sub(r'\s+(UNIT|APT|STE|SUITE|#)\s*\w*', '', street_address, flags=re.IGNORECASE)
    street_address = street_address.strip()

    # Handle trailing unit letters (like "310 HOWARD ST B" -> "310B HOWARD ST")
    # This normalizes addresses with unit letters at the end
    trailing_unit_match = re.match(r'^(\d+)\s+(.+?)\s+([A-Z])$', street_address, re.IGNORECASE)
    if trailing_unit_match:
        num = trailing_unit_match.group(1)
        street = trailing_unit_match.group(2)
        unit = trailing_unit_match.group(3).upper()
        street_address = f"{num}{unit} {street}"

    # Convert to lowercase, replace spaces/special chars with dashes
    slug = re.sub(r'[^a-z0-9]+', '-', street_address.lower())
    slug = slug.strip('-')  # trim leading/trailing dashes

    return slug


def provider_to_slug(provider: str) -> str:
    """
    Convert a provider name to a URL-safe slug.
    "Duke Energy" -> "duke-energy"
    """
    slug = re.sub(r'[^a-z0-9]+', '-', provider.lower())
    return slug.strip('-')


def format_billing_period(date: datetime) -> str:
    """Format a billing period from a date. Returns "YYYY-MM" format."""
    return date.strftime("%Y-%m")


def get_bill_directory(address: str) -> Path:
    """Get the directory path for a property's bills."""
    slug = address_to_slug(address)
    return get_bills_directory() / slug


def get_bill_path(address: str, provider: str, billing_date: datetime) -> Path:
    """
    Get the full path for a bill PDF.

    Args:
        address: The service address (e.g., "3606 APPLING WAY, DURHAM NC")
        provider: The utility provider (e.g., "Duke Energy")
        billing_date: The billing date (used to determine YYYY-MM)

    Returns:
        Full path like "data/bills/3606-appling-way/duke-energy_2026-01.pdf"
    """
    dir_path = get_bill_directory(address)
    provider_slug = provider_to_slug(provider)
    period = format_billing_period(billing_date)
    return dir_path / f"{provider_slug}_{period}.pdf"


def ensure_bill_directory(address: str) -> Path:
    """Ensure the bill directory exists and return the path."""
    dir_path = get_bill_directory(address)
    dir_path.mkdir(parents=True, exist_ok=True)
    return dir_path


def save_bill_pdf(
    address: str,
    provider: str,
    billing_date: datetime,
    pdf_content: bytes
) -> str:
    """
    Save a bill PDF to the standardized location.

    Args:
        address: The service address
        provider: The utility provider
        billing_date: The billing date
        pdf_content: The PDF content as bytes

    Returns:
        The path where the file was saved
    """
    ensure_bill_directory(address)
    file_path = get_bill_path(address, provider, billing_date)

    # If file already exists with same size, skip
    if file_path.exists():
        existing_size = file_path.stat().st_size
        if existing_size == len(pdf_content):
            print(f"  Bill already exists: {file_path}")
            return str(file_path)

        # Different content, add timestamp suffix
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        new_path = file_path.with_stem(f"{file_path.stem}_{timestamp}")
        file_path = new_path

    with open(file_path, 'wb') as f:
        f.write(pdf_content)

    print(f"  Saved bill: {file_path}")
    return str(file_path)


def copy_bill_to_standard_location(
    source_path: str,
    address: str,
    provider: str,
    billing_date: datetime
) -> str:
    """Copy an existing bill PDF to the standardized location."""
    source = Path(source_path)
    if not source.exists():
        raise FileNotFoundError(f"Source file not found: {source_path}")

    ensure_bill_directory(address)
    dest_path = get_bill_path(address, provider, billing_date)

    # Check if already exists with same content
    if dest_path.exists():
        source_size = source.stat().st_size
        dest_size = dest_path.stat().st_size
        if source_size == dest_size:
            return str(dest_path)  # Already exists

        # Different content, add timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        dest_path = dest_path.with_stem(f"{dest_path.stem}_{timestamp}")

    import shutil
    shutil.copy2(source_path, dest_path)
    return str(dest_path)
