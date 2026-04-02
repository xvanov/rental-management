"""
Wake Electric scraper using Playwright + SmartHub API.

Logs into SmartHub, then uses the internal API to get billing data directly.
Much more reliable than trying to download PDFs via the SPA UI.
Portal URL: https://wemc.smarthub.coop
"""
import json
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

from playwright.sync_api import Playwright

sys.path.insert(0, str(Path(__file__).parent.parent))
from lib.base_scraper import BaseScraper
from lib.models import AccountInfo

from models import EnergyBillData, DocumentType


class WakeElectricScraper(BaseScraper):
    """Scraper for Wake Electric SmartHub portal (uses internal JSON API)."""

    PROVIDER_NAME = "Wake Electric"
    LOGIN_URL = "https://wemc.smarthub.coop/Login.html"
    BILLING_API = "/services/secured/billing/history/overview"

    def __init__(self, username: str, password: str, download_dir: str, **kwargs):
        super().__init__(download_dir=download_dir, username=username, password=password, **kwargs)
        self.username = username
        self.password = password

    def _login(self) -> bool:
        """Login to SmartHub Angular Material portal."""
        # SmartHub uses Angular Material inputs
        if not self._fill_field(["#mat-input-0", 'input[type="text"]'], self.username):
            print("Could not find username field")
            return False

        if not self._fill_field(["#mat-input-1", 'input[type="password"]'], self.password):
            print("Could not find password field")
            return False

        if not self._click_button([".nisc-primary-button", 'button:has-text("Sign In")']):
            print("Could not find Sign In button")
            return False

        self._wait_for_idle(8)

        page_text = self._get_page_text()[:500]
        if "CUSTOMER OVERVIEW" in page_text or "Make A Payment" in page_text:
            return True

        if "Sign In" in page_text and "Password" in page_text:
            print("Still on login page")
            return False

        return True

    def _get_accounts(self) -> list[AccountInfo]:
        """Extract account numbers from dashboard text."""
        text = self._get_page_text()
        matches = re.findall(r"(\d{10})\s*[—–-]\s*([A-Z\s\d]+?)(?:\s*[—–-]\s*\w+)?(?:\n|$)", text)
        accounts = []
        for acct_num, address in matches:
            accounts.append(AccountInfo(
                account_number=acct_num.strip(),
                service_address=address.strip(),
            ))
        return accounts

    def _download_bills(self) -> list[EnergyBillData]:
        """Fetch billing data via SmartHub internal JSON API."""
        bills = []
        accounts = self._get_accounts()

        if not accounts:
            # Fallback: look for account numbers in the page
            text = self._get_page_text()
            acct_nums = re.findall(r"\b(\d{10})\b", text)
            for num in set(acct_nums):
                accounts.append(AccountInfo(account_number=num))

        for account in accounts:
            print(f"\nFetching billing history for account {account.account_number}...")
            try:
                billing_data = self.page.evaluate(f'''async () => {{
                    const r = await fetch("{self.BILLING_API}?acctNbr={account.account_number}");
                    if (!r.ok) return null;
                    return await r.json();
                }}''')

                if not billing_data:
                    print(f"  No billing data for {account.account_number}")
                    continue

                # Process the latest bill
                latest = billing_data[0]
                bill = self._parse_api_bill(latest)
                if bill:
                    bills.append(bill)
                    print(f"  Bill: {bill.bill_date}, ${bill.amount_due:.2f}, {bill.kwh_used} kWh")

            except Exception as e:
                print(f"  Error fetching billing data: {e}")

        return bills

    def _parse_api_bill(self, data: dict) -> Optional[EnergyBillData]:
        """Parse a bill from the SmartHub JSON API response."""
        try:
            # Timestamp to date
            bill_ts = data.get("billingDateTimestamp", 0)
            bill_date = datetime.fromtimestamp(bill_ts / 1000).strftime("%Y-%m-%d") if bill_ts else None

            # Address from servLocs
            address = ""
            period_start = None
            period_end = None
            serv_locs = data.get("servLocs", [])
            if serv_locs:
                addr_data = serv_locs[0].get("address", {})
                parts = [addr_data.get("addr1", ""), addr_data.get("city", ""), addr_data.get("state", "")]
                address = ", ".join(p for p in parts if p)

                # Billing period from meter reading timestamps
                prev_ts = serv_locs[0].get("lastBillPrevReadDtTm", 0)
                pres_ts = serv_locs[0].get("lastBillPresReadDtTm", 0)
                if prev_ts:
                    period_start = datetime.fromtimestamp(prev_ts / 1000).strftime("%Y-%m-%d")
                if pres_ts:
                    period_end = datetime.fromtimestamp(pres_ts / 1000).strftime("%Y-%m-%d")

            return EnergyBillData(
                document_type=DocumentType.BILL,
                account_number=data.get("acctNbr", ""),
                service_address=address,
                bill_date=bill_date,
                amount_due=data.get("adjustedBillAmount", 0.0),
                billing_period_start=period_start,
                billing_period_end=period_end,
                kwh_used=float(data.get("totalUsage", 0)),
                energy_charge=data.get("totalUsageCharge", 0.0),
            )
        except Exception as e:
            print(f"  Error parsing API bill: {e}")
            return None
