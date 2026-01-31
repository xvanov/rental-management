#!/usr/bin/env python3
"""
Main entry point for Enbridge Gas bill fetching.

Usage:
    python main.py                     # Full fetch from portal
    python main.py --parse-only        # Parse existing PDFs only
    python main.py --visible           # Run browser visible (debug)
    python main.py --json              # Output as JSON
    python main.py --output FILE       # Save JSON to file
    python main.py --no-auto-mfa       # Disable automatic MFA retrieval
"""
import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

from models import FetchResult, GasBillData, DocumentType
from parser import parse_pdf


def parse_local_pdfs(directory: Path) -> FetchResult:
    """Parse all PDFs in the directory."""
    result = FetchResult(success=False)

    if not directory.exists():
        result.errors.append(f"Directory not found: {directory}")
        return result

    pdf_files = list(directory.glob("*.pdf"))
    if not pdf_files:
        result.errors.append(f"No PDF files found in {directory}")
        return result

    print(f"Found {len(pdf_files)} PDF files to parse")

    for pdf_path in pdf_files:
        try:
            print(f"Parsing: {pdf_path.name}")
            bill_data = parse_pdf(str(pdf_path))
            result.bills.append(bill_data)
            result.downloaded_pdfs.append(str(pdf_path))
        except Exception as e:
            result.errors.append(f"Error parsing {pdf_path.name}: {e}")

    result.success = len(result.bills) > 0
    return result


def main():
    parser = argparse.ArgumentParser(description="Fetch Enbridge Gas utility bills")
    parser.add_argument("--visible", action="store_true", help="Run browser in visible mode")
    parser.add_argument("--parse-only", action="store_true", help="Only parse existing PDFs")
    parser.add_argument("--test", action="store_true", help="Test mode with sample files")
    parser.add_argument("--json", "-j", action="store_true", help="Output as JSON")
    parser.add_argument("--output", "-o", type=str, help="Output JSON to file")
    parser.add_argument("--no-auto-mfa", action="store_true", help="Disable automatic MFA retrieval")

    args = parser.parse_args()

    # Load environment variables
    project_root = Path(__file__).parent.parent.parent
    env_path = project_root / ".env"
    if env_path.exists():
        load_dotenv(env_path)

    env_local = project_root / ".env.local"
    if env_local.exists():
        load_dotenv(env_local, override=True)

    # Download directory
    download_dir = project_root / "data" / "enbridge-bills"
    download_dir.mkdir(parents=True, exist_ok=True)

    if args.parse_only or args.test:
        # Parse-only mode
        result = parse_local_pdfs(download_dir)
    else:
        # Full fetch from portal
        import os
        from scraper import EnbridgeGasScraper

        username = os.getenv("ENBRIDGE_GAS_USER") or os.getenv("DOMINION_GAS_USER")
        password = os.getenv("ENBRIDGE_GAS_PASS") or os.getenv("DOMINION_GAS_PASS")

        if not username or not password:
            print("Error: ENBRIDGE_GAS_USER and ENBRIDGE_GAS_PASS must be set", file=sys.stderr)
            sys.exit(1)

        scraper = EnbridgeGasScraper(
            username=username,
            password=password,
            download_dir=str(download_dir),
            auto_mfa=not args.no_auto_mfa,
        )

        result = scraper.fetch_bills(headless=not args.visible)

    # Format output
    output_data = {
        "success": result.success,
        "timestamp": datetime.now().isoformat(),
        "count": len(result.bills),
        "bills": [b.to_dict() for b in result.bills],
        "requires_attention": [b.to_dict() for b in result.bills if b.requires_attention],
        "errors": result.errors,
        "downloaded_pdfs": result.downloaded_pdfs,
    }

    if args.json or args.output:
        output_json = json.dumps(output_data, indent=2)

        if args.output:
            with open(args.output, 'w') as f:
                f.write(output_json)
            print(f"Results saved to: {args.output}", file=sys.stderr)
        else:
            print(output_json)
    else:
        # Human readable output
        print("\n" + "="*60)
        print("ENBRIDGE GAS FETCH RESULTS")
        print("="*60)
        print(f"Success: {result.success}")
        print(f"Bills found: {len(result.bills)}")
        print(f"PDFs: {len(result.downloaded_pdfs)}")

        if result.errors:
            print(f"\nErrors:")
            for err in result.errors:
                print(f"  - {err}")

        if result.bills:
            print("\n" + "-"*60)
            for bill in result.bills:
                print(f"\nAccount: {bill.account_number}")
                print(f"Address: {bill.service_address}")
                print(f"Amount Due: ${bill.amount_due:.2f}")
                if bill.due_date:
                    print(f"Due Date: {bill.due_date}")
                if bill.billing_period_start and bill.billing_period_end:
                    print(f"Period: {bill.billing_period_start} to {bill.billing_period_end}")
                if bill.therms_used:
                    print(f"Therms: {bill.therms_used}")
                if bill.requires_attention:
                    print(f"*** ATTENTION: {bill.attention_reason} ***")

    return 0 if result.success else 1


if __name__ == "__main__":
    sys.exit(main())
