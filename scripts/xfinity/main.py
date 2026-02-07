#!/usr/bin/env python3
"""
Main entry point for Xfinity bill fetching.

Usage:
    python main.py                     # Full fetch from portal
    python main.py --parse-only        # Parse existing PDFs only
    python main.py --visible           # Run browser visible (debug)
    python main.py --json              # Output as JSON
    python main.py --output FILE       # Save JSON to file
"""
import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

from models import FetchResult, InternetBillData, DocumentType, AccountInfo
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


def get_xfinity_accounts() -> list[tuple[str, str, str]]:
    """
    Get all Xfinity accounts from environment variables.

    Looks for patterns like:
        XFINITY_INTERENT_USER / XFINITY_INTERENT_PASS (primary format)
        XFINITY_INTERNET_USER / XFINITY_INTERNET_PASS (alternative)
        XFINITY_USER / XFINITY_PASS (legacy single account)
        XFINITY_<ID>_USER / XFINITY_<ID>_PASS (multiple accounts)

    Returns list of (account_id, username, password) tuples.
    """
    import os
    import re

    accounts = []

    # Check for XFINITY_INTERENT_USER format first (note: typo in env var name)
    username = os.environ.get("XFINITY_INTERENT_USER")
    password = os.environ.get("XFINITY_INTERENT_PASS")
    if username and password:
        accounts.append(("INTERENT", username, password))
        print(f"Found Xfinity account: INTERENT")
        return accounts

    # Check for XFINITY_INTERNET_USER format (correct spelling)
    username = os.environ.get("XFINITY_INTERNET_USER")
    password = os.environ.get("XFINITY_INTERNET_PASS")
    if username and password:
        accounts.append(("INTERNET", username, password))
        print(f"Found Xfinity account: INTERNET")
        return accounts

    # Check for pattern-based accounts (XFINITY_<ID>_USER)
    pattern = re.compile(r'^XFINITY_([A-Z0-9_]+)_USER$')

    for key in os.environ:
        match = pattern.match(key)
        if match:
            account_id = match.group(1)
            username = os.environ.get(key)
            password = os.environ.get(f'XFINITY_{account_id}_PASS')

            if username and password:
                accounts.append((account_id, username, password))
                print(f"Found Xfinity account: {account_id}")

    # Also check for legacy single-account format
    if not accounts:
        username = os.environ.get("XFINITY_USER")
        password = os.environ.get("XFINITY_PASS")
        if username and password:
            accounts.append(("DEFAULT", username, password))

    return accounts


def main():
    parser = argparse.ArgumentParser(description="Fetch Xfinity utility bills")
    parser.add_argument("--visible", action="store_true", help="Run browser in visible mode")
    parser.add_argument("--parse-only", action="store_true", help="Only parse existing PDFs")
    parser.add_argument("--test", action="store_true", help="Test mode with sample files")
    parser.add_argument("--json", "-j", action="store_true", help="Output as JSON")
    parser.add_argument("--output", "-o", type=str, help="Output JSON to file")
    parser.add_argument("--account", "-a", type=str, help="Only fetch specific account")

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
    download_dir = project_root / "data" / "xfinity-bills"
    download_dir.mkdir(parents=True, exist_ok=True)

    if args.parse_only or args.test:
        # Parse-only mode
        result = parse_local_pdfs(download_dir)
    else:
        # Full fetch from portal
        import os
        from scraper import XfinityScraper

        accounts = get_xfinity_accounts()

        if not accounts:
            print("Error: No Xfinity credentials found.", file=sys.stderr)
            print("Set either:", file=sys.stderr)
            print("  XFINITY_<ID>_USER and XFINITY_<ID>_PASS", file=sys.stderr)
            print("  or XFINITY_USER and XFINITY_PASS", file=sys.stderr)
            sys.exit(1)

        # Filter to specific account if requested
        if args.account:
            accounts = [(aid, u, p) for aid, u, p in accounts if aid.upper() == args.account.upper()]
            if not accounts:
                print(f"Error: Account '{args.account}' not found", file=sys.stderr)
                sys.exit(1)

        print(f"Found {len(accounts)} Xfinity account(s) to process")

        # Aggregate results from all accounts
        result = FetchResult(success=False)

        for account_id, username, password in accounts:
            print(f"\n{'='*60}")
            print(f"Processing account: {account_id}")
            print(f"{'='*60}")

            scraper = XfinityScraper(
                username=username,
                password=password,
                download_dir=str(download_dir),
            )

            account_result = scraper.fetch_bills(headless=not args.visible)

            # Merge results
            result.accounts.extend(account_result.accounts)
            result.bills.extend(account_result.bills)
            result.errors.extend(account_result.errors)
            result.downloaded_pdfs.extend(account_result.downloaded_pdfs)

            if account_result.success:
                result.success = True

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
        print("XFINITY FETCH RESULTS")
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
                if bill.requires_attention:
                    print(f"*** ATTENTION: {bill.attention_reason} ***")

    return 0 if result.success else 1


if __name__ == "__main__":
    sys.exit(main())
