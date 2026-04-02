"""
Graham Utilities scraper using Playwright.

Logs into the Edmunds WIPP portal via Utility Quick Pay,
confirms account details, and downloads the current bill PDF.
Portal URL: https://wipp.edmundsgovtech.cloud/home?wippId=GRAM
"""
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

from models import GrahamBillData
from parser import parse_pdf


class GrahamUtilitiesScraper(BaseScraper):
    """Scraper for Graham Utilities WIPP portal."""

    PROVIDER_NAME = "Graham Utilities"
    LOGIN_URL = "https://wipp.edmundsgovtech.cloud/home?wippId=GRAM"

    def __init__(self, account_id: str, pin: str, download_dir: str, **kwargs):
        super().__init__(download_dir=download_dir, **kwargs)
        # Account ID format: "50530-17" → prefix "50530", suffix "17"
        parts = account_id.split("-")
        self.account_prefix = parts[0]
        self.account_suffix = parts[1] if len(parts) > 1 else ""
        self.pin = pin
        self.account_id = account_id

    def _setup_browser(self, playwright: Playwright, headless: bool = True):
        """Use stealth mode — WIPP portal blocks standard headless Chrome."""
        self._setup_stealth_browser(playwright, headless)

    def _login(self) -> bool:
        """Fill the Utility Quick Pay form and confirm account details."""
        self._wait_for_idle(5)

        # The page has 3 sections. We need "Utility Quick Pay" (leftmost).
        # It has: Account Id [prefix] - [suffix], Account PIN [pin], Search button.

        # Find all visible text inputs
        inputs = self.page.query_selector_all('input:visible')
        print(f"Found {len(inputs)} visible inputs")

        # Page layout: inputs [0]=email, [1]=password (Account Log In section),
        # then [2]=account prefix, [3]=account suffix, [4]=PIN (Utility Quick Pay section).
        # Skip the first email+password inputs and fill the Utility Quick Pay fields.
        text_inputs = [i for i in inputs if (i.get_attribute("type") or "text") in ("text", "number", "tel", "")]

        # text_inputs[0] = email, [1] = account prefix, [2] = suffix, [3] = PIN, ...
        if len(text_inputs) < 4:
            print(f"Expected at least 4 text inputs, found {len(text_inputs)}")
            self._save_screenshot("no_account_fields.png")
            return False

        print(f"Filling account info: {self.account_id}, PIN: ****")
        text_inputs[1].fill(self.account_prefix)
        text_inputs[2].fill(self.account_suffix)
        text_inputs[3].fill(self.pin)

        # Click the first Search button (Utility Quick Pay section)
        search_buttons = self.page.query_selector_all('button:has-text("Search")')
        if not search_buttons:
            print("Could not find Search button")
            return False
        search_buttons[0].click()

        self._wait_for_idle(3)

        # Look for "Confirm Account Details" dialog
        confirm_text = self._get_page_text()
        if "Confirm Account Details" in confirm_text or "Confirm" in confirm_text:
            print("Confirm dialog found, clicking Confirm...")
            self._click_button([
                'button:has-text("Confirm")',
                'button:has-text("OK")',
            ])
            self._wait_for_idle(3)
            return True

        # Check if we went straight to the bill
        if "View Current Bill" in self._get_page_text() or "Current Bill" in self._get_page_text():
            return True

        print("No confirm dialog or bill page found")
        self._save_screenshot("after_search.png")
        return False

    def _download_bills(self) -> list:
        """Click 'View Current Bill' to download the PDF."""
        bills = []
        page_text = self._get_page_text()

        # Click "View Current Bill"
        view_bill = self._find_field([
            'a:has-text("View Current Bill")',
            'button:has-text("View Current Bill")',
            'a:has-text("Current Bill")',
            'a:has-text("View Bill")',
        ])

        if not view_bill:
            print("Could not find 'View Current Bill' button")
            self._save_screenshot("no_view_bill.png")
            return bills

        print("Clicking 'View Current Bill'...")
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"graham_{self.account_id}_{timestamp}.pdf"

        # The button typically triggers a PDF download
        pdf_path = self._expect_download(lambda: view_bill.click(), filename)

        if not pdf_path:
            # Try: it might open in a new tab
            try:
                with self.page.expect_popup(timeout=10000) as popup_info:
                    view_bill.click()
                new_page = popup_info.value
                new_page.wait_for_load_state("load", timeout=10000)
                url = new_page.url
                if ".pdf" in url:
                    pdf_path = self._download_pdf_from_url(url, filename)
                new_page.close()
            except Exception as e:
                print(f"  Popup approach failed: {e}")

        if pdf_path:
            print(f"Downloaded PDF: {pdf_path}")
            try:
                bill = parse_pdf(pdf_path)
                # Fix amount_due if it's 0 (auto-pay shows $0 total due)
                if bill.amount_due == 0:
                    charges = (bill.water_charges + bill.sewer_charges +
                               bill.stormwater_charges + bill.refuse_charges +
                               bill.recycling_charges)
                    if charges > 0:
                        bill.amount_due = charges

                if bill.service_location:
                    bill_date_str = bill.bill_date if isinstance(bill.bill_date, str) else (
                        bill.bill_date.isoformat() if bill.bill_date else None)
                    billing_date = datetime.strptime(bill_date_str, "%Y-%m-%d") if bill_date_str else datetime.now()
                    self._copy_to_standard_location(pdf_path, bill.service_location, billing_date)
                bills.append(bill)
            except Exception as e:
                print(f"  Error parsing PDF: {e}")
        else:
            print("PDF download failed")

        return bills
