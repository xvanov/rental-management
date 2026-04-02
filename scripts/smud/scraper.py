"""
SMUD (Sacramento Municipal Utility District) scraper using Playwright.

Logs into the SMUD portal and downloads the latest bill PDF.
Portal URL: https://myaccount.smud.org
"""
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

from playwright.sync_api import Playwright

# Add parent directory to path for lib imports
sys.path.insert(0, str(Path(__file__).parent.parent))
from lib.base_scraper import BaseScraper
from lib.models import AccountInfo

from models import SmudBillData
from parser import parse_pdf


class SmudScraper(BaseScraper):
    """Scraper for SMUD utility portal."""

    PROVIDER_NAME = "SMUD"
    LOGIN_URL = "https://myaccount.smud.org/?ack=true"
    BILL_URL = "https://myaccount.smud.org/manage/digitalbill"

    def __init__(self, username: str, password: str, download_dir: str, **kwargs):
        super().__init__(download_dir=download_dir, username=username, password=password, **kwargs)
        self.username = username
        self.password = password

    def _login(self) -> bool:
        """Login using #UserId and #Password fields."""
        if not self._fill_field(["#UserId", 'input[name="UserId"]'], self.username):
            print("Could not find username field")
            return False

        if not self._fill_field(["#Password", 'input[name="Password"]'], self.password):
            print("Could not find password field")
            return False

        if not self._click_button(['button[type="submit"]', 'button:has-text("Sign in")']):
            print("Could not find sign in button")
            return False

        # Wait for dashboard to load (use domcontentloaded, NOT networkidle)
        try:
            self.page.wait_for_load_state("domcontentloaded", timeout=15000)
        except Exception:
            pass
        self._wait_for_idle(5)

        # Verify we're on the dashboard
        if "/dashboard" in self.page.url or "/manage/" in self.page.url:
            return True

        # Check if still on login page
        page_text = self._get_page_text()[:500]
        if "Sign in to My Account" in page_text:
            print("Still on login page — credentials may be wrong")
            return False

        return True

    def _get_accounts(self) -> list[AccountInfo]:
        """Extract account number from the dashboard header."""
        text = self._get_page_text()
        # Header shows: "Welcome, KALIN S Account 7037161"
        match = re.search(r"Account\s+(\d{7,10})", text)
        if match:
            return [AccountInfo(account_number=match.group(1))]
        return []

    def _download_bills(self) -> list[SmudBillData]:
        """Navigate to digital bill page and download the PDF."""
        bills = []

        # Navigate to bill page
        print(f"Navigating to bill page: {self.BILL_URL}")
        self.page.goto(self.BILL_URL, wait_until="domcontentloaded")
        self._wait_for_idle(5)

        page_text = self._get_page_text()

        # Extract bill info from the page (it shows everything inline)
        account_match = re.search(r"Account\s+(\d{7,10})", page_text)
        account_number = account_match.group(1) if account_match else "unknown"

        # Find the Download button/link
        download_link = self._find_field([
            'a:has-text("Download")',
            'button:has-text("Download")',
            'a[download]',
            'a[href*="pdf"]',
            'a[href*="bill"]',
        ])

        if not download_link:
            print("Could not find Download button on bill page")
            # Try to parse from page text instead
            bill = self._parse_bill_from_page(page_text, account_number)
            if bill:
                bills.append(bill)
            return bills

        # Download the PDF
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"smud_{account_number}_{timestamp}.pdf"

        href = download_link.get_attribute("href")
        pdf_path = None

        if href and href.startswith("http"):
            # Direct URL download
            pdf_path = self._download_pdf_from_url(href, filename)
        elif href:
            # Relative URL
            full_url = f"https://myaccount.smud.org{href}"
            pdf_path = self._download_pdf_from_url(full_url, filename)

        if not pdf_path:
            # Try click-to-download
            pdf_path = self._expect_download(lambda: download_link.click(), filename)

        if pdf_path:
            print(f"Downloaded PDF: {pdf_path}")
            try:
                bill = parse_pdf(pdf_path)
                # Copy to standard location
                if bill.service_address:
                    bill_date_str = bill.bill_date if isinstance(bill.bill_date, str) else (bill.bill_date.isoformat() if bill.bill_date else None)
                    billing_date = datetime.strptime(bill_date_str, "%Y-%m-%d") if bill_date_str else datetime.now()
                    self._copy_to_standard_location(pdf_path, bill.service_address, billing_date)
                bills.append(bill)
            except Exception as e:
                print(f"  Error parsing PDF: {e}")
                # Fall back to page text parsing
                bill = self._parse_bill_from_page(page_text, account_number)
                if bill:
                    bill.pdf_path = pdf_path
                    bills.append(bill)
        else:
            print("PDF download failed — parsing from page text")
            bill = self._parse_bill_from_page(page_text, account_number)
            if bill:
                bills.append(bill)

        return bills

    def _parse_bill_from_page(self, text: str, account_number: str) -> Optional[SmudBillData]:
        """Parse bill data from the digital bill page text as fallback."""
        try:
            from models import DocumentType

            # Extract billing period: "2/7/2026 — 3/10/2026 (32 days)"
            period_match = re.search(r"(\d{1,2}/\d{1,2}/\d{4})\s*[—–-]\s*(\d{1,2}/\d{1,2}/\d{4})\s*\((\d+)\s*days\)", text)
            billing_start = None
            billing_end = None
            billing_days = 0
            if period_match:
                billing_start = datetime.strptime(period_match.group(1), "%m/%d/%Y").strftime("%Y-%m-%d")
                billing_end = datetime.strptime(period_match.group(2), "%m/%d/%Y").strftime("%Y-%m-%d")
                billing_days = int(period_match.group(3))

            # Extract amount: "Current Charges, Due 04/08/26\n$147.59"
            amount_match = re.search(r"Current Charges.*?Due\s+(\d{2}/\d{2}/\d{2,4})\s*\$([0-9,.]+)", text, re.DOTALL)
            amount = 0.0
            due_date = None
            if amount_match:
                due_str = amount_match.group(1)
                # Handle 2-digit year
                if len(due_str.split("/")[-1]) == 2:
                    due_date = datetime.strptime(due_str, "%m/%d/%y").strftime("%Y-%m-%d")
                else:
                    due_date = datetime.strptime(due_str, "%m/%d/%Y").strftime("%Y-%m-%d")
                amount = float(amount_match.group(2).replace(",", ""))

            # Extract kWh
            kwh_match = re.search(r"\((\d+)\s*kWh\)", text)
            kwh = float(kwh_match.group(1)) if kwh_match else 0

            # Extract meter number
            meter_match = re.search(r"Meter number\s*(\d+)", text)
            meter = meter_match.group(1) if meter_match else None

            # Extract bill issue date (first one in the list is the latest)
            issue_match = re.search(r"Bill issue date\s+(\d{2}/\d{2}/\d{4})", text)
            bill_date = None
            if issue_match:
                bill_date = datetime.strptime(issue_match.group(1), "%m/%d/%Y").strftime("%Y-%m-%d")

            # Get service address from page (not always shown on bill page)
            # Fallback to account services page if needed
            address = ""
            addr_match = re.search(r"(\d+\s+[A-Z][A-Z\s]+(?:ST|AVE|DR|WAY|CT|RD|BLVD|LN|PL|CIR))", text, re.IGNORECASE)
            if addr_match:
                address = addr_match.group(1).strip()

            return SmudBillData(
                document_type=DocumentType.BILL,
                account_number=account_number,
                service_address=address,
                bill_date=bill_date,
                due_date=due_date,
                amount_due=amount,
                billing_period_start=billing_start,
                billing_period_end=billing_end,
                billing_days=billing_days,
                kwh_used=kwh,
                meter_number=meter,
                electric_charges=amount,
            )
        except Exception as e:
            print(f"  Error parsing bill from page: {e}")
            return None
