#!/usr/bin/env python3
"""
Wake Electric Utility Bill Fetcher

Main entry point for fetching and parsing Wake Electric utility bills.

Usage:
    python main.py                  # Fetch bills from portal (headless)
    python main.py --visible        # Fetch with visible browser (for debugging)
    python main.py --parse-only     # Parse existing PDFs in download dir
    python main.py --test           # Test parser with sample files
"""
import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

from models import EnergyBillData, DocumentType, FetchResult
from parser import parse_pdf


def get_project_root() -> Path:
    """Get the project root directory."""
    return Path(__file__).parent.parent.parent


def load_env():
    """Load environment variables from .env files."""
    root = get_project_root()
    loaded = False
    # Load in order - later files override earlier ones
    for env_file in [".env", ".env.local"]:
        env_path = root / env_file
        if env_path.exists():
            load_dotenv(env_path, override=True)
            loaded = True
    return loaded


def parse_existing_pdfs(pdf_dir: Path) -> list[EnergyBillData]:
    """Parse all Wake Electric PDFs in a directory."""
    bills = []

    if not pdf_dir.exists():
        print(f"Directory not found: {pdf_dir}")
        return bills

    # Look for Wake Electric specific PDFs or all PDFs
    pdf_files = list(pdf_dir.glob("*wake*.pdf")) + list(pdf_dir.glob("*electric*.pdf"))
    if not pdf_files:
        # Fall back to all PDFs in wake-electric subfolder
        pdf_files = list(pdf_dir.glob("*.pdf"))

    print(f"Found {len(pdf_files)} PDF files in {pdf_dir}")

    for pdf_path in pdf_files:
        try:
            print(f"\nParsing: {pdf_path.name}")
            bill = parse_pdf(str(pdf_path))
            bills.append(bill)

            print(f"  Account: {bill.account_number}")
            print(f"  Address: {bill.service_address}")
            print(f"  Type: {bill.document_type.value}")
            print(f"  Amount: ${bill.amount_due:.2f}")
            if bill.due_date:
                print(f"  Due: {bill.due_date}")
            if bill.kwh_used:
                print(f"  kWh: {bill.kwh_used}")
            if bill.requires_attention:
                print(f"  *** {bill.attention_reason} ***")

        except Exception as e:
            print(f"  Error: {e}")

    return bills


def test_parser():
    """Test the parser with sample files."""
    sample_dir = get_project_root() / "data" / "sample-bills"

    print("Testing parser with sample files...")
    print("="*60)

    # Look for wake electric sample
    sample_files = list(sample_dir.glob("*wake*.pdf"))
    if not sample_files:
        # Try downloaded bills folder
        download_dir = get_project_root() / "data" / "downloaded-bills" / "wake-electric"
        sample_files = list(download_dir.glob("*.pdf"))

    if not sample_files:
        print("No Wake Electric sample files found")
        return False

    for pdf_path in sample_files:
        try:
            print(f"\nParsing: {pdf_path.name}")
            result = parse_pdf(str(pdf_path))
            print(json.dumps(result.to_dict(), indent=2, default=str))
        except Exception as e:
            print(f"Error: {e}")
            return False

    return True


def fetch_from_portal(headless: bool = True) -> FetchResult:
    """Fetch bills from the Wake Electric portal."""
    from scraper import WakeElectricScraper

    username = os.getenv("WAKE_ELECTRIC_USER")
    password = os.getenv("WAKE_ELECTRIC_PASS")

    if not username or not password:
        print("Error: WAKE_ELECTRIC_USER and WAKE_ELECTRIC_PASS must be set")
        return FetchResult(success=False, errors=["Missing credentials"])

    download_dir = get_project_root() / "data" / "downloaded-bills" / "wake-electric"

    scraper = WakeElectricScraper(
        username=username,
        password=password,
        download_dir=str(download_dir),
    )

    return scraper.fetch_bills(headless=headless)


def output_json(bills: list[EnergyBillData], output_path: Path = None):
    """Output bills as JSON."""
    data = {
        "timestamp": datetime.now().isoformat(),
        "count": len(bills),
        "bills": [b.to_dict() for b in bills],
        "requires_attention": [b.to_dict() for b in bills if b.requires_attention],
    }

    if output_path:
        with open(output_path, 'w') as f:
            json.dump(data, f, indent=2)
        print(f"\nResults saved to: {output_path}")
    else:
        print(json.dumps(data, indent=2))


def main():
    parser = argparse.ArgumentParser(
        description="Wake Electric Utility Bill Fetcher",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--visible", "-v",
        action="store_true",
        help="Run browser in visible mode (for debugging)",
    )
    parser.add_argument(
        "--parse-only", "-p",
        action="store_true",
        help="Only parse existing PDFs, don't fetch from portal",
    )
    parser.add_argument(
        "--test", "-t",
        action="store_true",
        help="Test parser with sample files",
    )
    parser.add_argument(
        "--json", "-j",
        action="store_true",
        help="Output results as JSON only",
    )
    parser.add_argument(
        "--output", "-o",
        type=str,
        help="Save results to specified JSON file",
    )

    args = parser.parse_args()

    # Load environment
    load_env()

    if args.test:
        # Test mode
        success = test_parser()
        sys.exit(0 if success else 1)

    elif args.parse_only:
        # Parse existing PDFs
        download_dir = get_project_root() / "data" / "downloaded-bills" / "wake-electric"
        # Also check the main sample-bills folder
        sample_dir = get_project_root() / "data" / "sample-bills"

        bills = []
        if download_dir.exists():
            bills.extend(parse_existing_pdfs(download_dir))
        if sample_dir.exists():
            # Parse wake electric samples from sample-bills
            for pdf in sample_dir.glob("*wake*.pdf"):
                try:
                    bills.append(parse_pdf(str(pdf)))
                except Exception as e:
                    print(f"Error parsing {pdf}: {e}")

        if args.json or args.output:
            output_path = Path(args.output) if args.output else None
            output_json(bills, output_path)

    else:
        # Fetch from portal
        print("Fetching bills from Wake Electric portal...")
        result = fetch_from_portal(headless=not args.visible)

        if args.json or args.output:
            output_path = Path(args.output) if args.output else None
            output_json(result.bills, output_path)
        else:
            # Pretty print results
            print("\n" + "="*60)
            print("FETCH RESULTS")
            print("="*60)
            print(f"Success: {result.success}")
            print(f"Bills: {len(result.bills)}")

            if result.errors:
                print("\nErrors:")
                for err in result.errors:
                    print(f"  - {err}")

            # Show bills requiring attention first
            attention_bills = [b for b in result.bills if b.requires_attention]
            if attention_bills:
                print("\n" + "!"*60)
                print("BILLS REQUIRING ATTENTION")
                print("!"*60)
                for bill in attention_bills:
                    print(f"\n  Account: {bill.account_number}")
                    print(f"  Address: {bill.service_address}")
                    print(f"  Amount: ${bill.amount_due:.2f}")
                    if bill.due_date:
                        print(f"  Due: {bill.due_date}")
                    print(f"  Reason: {bill.attention_reason}")

            # Show regular bills
            regular_bills = [b for b in result.bills if not b.requires_attention]
            if regular_bills:
                print("\n" + "-"*60)
                print("REGULAR BILLS")
                print("-"*60)
                for bill in regular_bills:
                    print(f"\n  Account: {bill.account_number}")
                    print(f"  Address: {bill.service_address}")
                    print(f"  Amount: ${bill.amount_due:.2f}")
                    if bill.due_date:
                        print(f"  Due: {bill.due_date}")
                    if bill.billing_period_start:
                        print(f"  Period: {bill.billing_period_start} to {bill.billing_period_end}")
                    if bill.kwh_used:
                        print(f"  Usage: {bill.kwh_used} kWh")

        sys.exit(0 if result.success else 1)


if __name__ == "__main__":
    main()
