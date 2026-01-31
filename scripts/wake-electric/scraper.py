"""
Wake Electric utility bill scraper using Playwright.

Logs into the Wake Electric SmartHub portal and downloads bill PDFs.
Portal URL: https://wemc.smarthub.coop/ui/#/home
"""
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional
import time
import re

from playwright.sync_api import sync_playwright, Page, Browser, TimeoutError as PlaywrightTimeout
from dotenv import load_dotenv
import requests

from models import AccountInfo, FetchResult, EnergyBillData
from parser import parse_pdf


class WakeElectricScraper:
    """Scraper for Wake Electric SmartHub portal."""

    BASE_URL = "https://wemc.smarthub.coop"
    LOGIN_URL = f"{BASE_URL}/Login.html"
    HOME_URL = f"{BASE_URL}/ui/#/home"

    def __init__(self, username: str, password: str, download_dir: str, debug_screenshots: bool = False):
        self.username = username
        self.password = password
        self.download_dir = Path(download_dir)
        self.download_dir.mkdir(parents=True, exist_ok=True)
        self.browser: Optional[Browser] = None
        self.page: Optional[Page] = None
        self.debug_screenshots = debug_screenshots or os.getenv("DEBUG_SCREENSHOTS", "").lower() == "true"

    def _save_screenshot(self, name: str):
        """Save screenshot only if debug mode is enabled."""
        if self.debug_screenshots:
            self.page.screenshot(path=str(self.download_dir / name))

    def _setup_browser(self, playwright, headless: bool = True):
        """Set up the browser with download handling."""
        self.browser = playwright.chromium.launch(headless=headless)
        context = self.browser.new_context(
            accept_downloads=True,
            viewport={"width": 1920, "height": 1080},
        )
        self.page = context.new_page()

    def _login(self) -> bool:
        """Log into the Wake Electric SmartHub portal."""
        print(f"Navigating to login page: {self.LOGIN_URL}")
        self.page.goto(self.LOGIN_URL, wait_until="networkidle")

        # Wait for login form
        try:
            self.page.wait_for_selector('input[name="username"], input[type="email"], #username', timeout=15000)
        except PlaywrightTimeout:
            print("Could not find username field")
            self._save_screenshot("login_error.png")
            return False

        # Find and fill username field
        username_selectors = [
            'input[name="username"]',
            'input[type="email"]',
            '#username',
            'input[id*="username"]',
            'input[id*="email"]',
        ]

        username_field = None
        for selector in username_selectors:
            try:
                field = self.page.query_selector(selector)
                if field and field.is_visible():
                    username_field = field
                    break
            except Exception:
                continue

        if not username_field:
            print("Could not find username field")
            self._save_screenshot("login_error.png")
            return False

        # Find password field
        password_selectors = [
            'input[type="password"]',
            'input[name="password"]',
            '#password',
        ]

        password_field = None
        for selector in password_selectors:
            try:
                field = self.page.query_selector(selector)
                if field and field.is_visible():
                    password_field = field
                    break
            except Exception:
                continue

        if not password_field:
            print("Could not find password field")
            self._save_screenshot("login_error.png")
            return False

        # Fill credentials
        print("Filling login credentials...")
        username_field.fill(self.username)
        password_field.fill(self.password)

        # Find and click login button
        login_selectors = [
            'button[type="submit"]',
            'input[type="submit"]',
            'button:has-text("Sign In")',
            'button:has-text("Log In")',
            'button:has-text("Login")',
            '#loginButton',
            '.login-button',
        ]

        for selector in login_selectors:
            try:
                button = self.page.query_selector(selector)
                if button and button.is_visible():
                    button.click()
                    break
            except Exception:
                continue

        # Wait for navigation after login
        try:
            self.page.wait_for_load_state("networkidle", timeout=30000)
        except PlaywrightTimeout:
            pass

        # Wait for page to stabilize
        self.page.wait_for_timeout(3000)

        # Check if login was successful - should redirect to home
        current_url = self.page.url
        page_content = self.page.content().lower()

        if "login" in current_url.lower() and ("error" in page_content or "invalid" in page_content or "incorrect" in page_content):
            print("Login failed - invalid credentials")
            self._save_screenshot("login_failed.png")
            return False

        print(f"Login appears successful. Current URL: {current_url}")
        self._save_screenshot("after_login.png")
        return True

    def _navigate_to_home(self) -> bool:
        """Navigate to the account home/overview page."""
        try:
            print(f"Navigating to home page: {self.HOME_URL}")
            self.page.goto(self.HOME_URL, wait_until="networkidle")
            self.page.wait_for_timeout(3000)
            self._save_screenshot("home_page.png")
            return True
        except Exception as e:
            print(f"Error navigating to home: {e}")
            return False

    def _get_accounts(self) -> list[AccountInfo]:
        """Get list of accounts from the customer overview."""
        accounts = []

        try:
            # Wait for page to load
            self.page.wait_for_load_state("networkidle")
            self.page.wait_for_timeout(2000)

            # Look for account information on the page
            # SmartHub typically shows accounts in expandable sections
            page_text = self.page.content()

            # Extract 10-digit account numbers
            account_matches = re.findall(r'(\d{10})', page_text)

            seen = set()
            for match in account_matches:
                if match not in seen:
                    seen.add(match)
                    accounts.append(AccountInfo(
                        account_number=match,
                        service_address="",  # Will be filled from PDF
                        current_balance=0.0,
                    ))

            print(f"Found {len(accounts)} account(s)")

        except Exception as e:
            print(f"Error getting accounts: {e}")

        return accounts

    def _expand_account_details(self) -> bool:
        """Expand account details by clicking the down arrow."""
        try:
            # Look for expand/collapse buttons or arrows
            expand_selectors = [
                '[class*="expand"]',
                '[class*="arrow"]',
                '[class*="chevron"]',
                'button[aria-expanded="false"]',
                '.accordion-toggle',
                '[data-toggle="collapse"]',
                'i.fa-chevron-down',
                'i.fa-angle-down',
            ]

            for selector in expand_selectors:
                try:
                    elements = self.page.query_selector_all(selector)
                    for elem in elements:
                        if elem.is_visible():
                            elem.click()
                            self.page.wait_for_timeout(1000)
                except Exception:
                    continue

            self._save_screenshot("expanded_details.png")
            return True

        except Exception as e:
            print(f"Error expanding details: {e}")
            return False

    def _download_bill_pdf(self, account_number: str = None) -> Optional[str]:
        """Download the bill PDF for an account."""
        try:
            print("Looking for View Bill button...")

            # Look for "View Bill" button in SmartHub
            view_bill_selectors = [
                'a:has-text("View Bill")',
                'button:has-text("View Bill")',
                '[class*="view-bill"]',
                'a[href*="billPdfService"]',
                'a[href*=".pdf"]',
                '[onclick*="viewBill"]',
                'a:has-text("View")',
            ]

            view_btn = None
            for selector in view_bill_selectors:
                try:
                    btn = self.page.query_selector(selector)
                    if btn and btn.is_visible():
                        view_btn = btn
                        print(f"Found view bill button: {selector}")
                        break
                except Exception:
                    continue

            if not view_btn:
                print("Could not find View Bill button")
                self._save_screenshot("no_view_bill.png")
                return None

            # Prepare filename
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            account_str = account_number or "unknown"
            filename = f"wake_electric_{account_str}_{timestamp}.pdf"
            save_path = self.download_dir / filename

            # Try clicking the button - it may open PDF in new tab
            try:
                # Listen for new page (PDF might open in new tab)
                with self.page.context.expect_page(timeout=10000) as new_page_info:
                    view_btn.click()
                new_page = new_page_info.value
                new_page.wait_for_load_state("networkidle")

                pdf_url = new_page.url
                print(f"New tab opened with URL: {pdf_url}")

                if '.pdf' in pdf_url.lower() or 'billPdfService' in pdf_url:
                    # Download the PDF content using cookies
                    cookies = {c['name']: c['value'] for c in self.page.context.cookies()}
                    response = requests.get(pdf_url, cookies=cookies, timeout=30)
                    if response.status_code == 200 and response.content[:4] == b'%PDF':
                        with open(save_path, 'wb') as f:
                            f.write(response.content)
                        print(f"Downloaded PDF from new tab: {save_path}")
                        new_page.close()
                        return str(save_path)
                new_page.close()

            except PlaywrightTimeout:
                print("No new tab opened, trying direct download...")

            # Try direct click and download
            try:
                with self.page.expect_download(timeout=30000) as download_info:
                    view_btn.click()
                download = download_info.value
                download.save_as(str(save_path))
                print(f"Downloaded PDF directly: {save_path}")
                return str(save_path)
            except PlaywrightTimeout:
                print("No direct download available")

            # Try to find PDF URL in page and download via requests
            try:
                self.page.wait_for_timeout(2000)

                # Look for PDF links in page
                pdf_links = self.page.query_selector_all('a[href*=".pdf"], a[href*="billPdfService"]')
                for link in pdf_links:
                    href = link.get_attribute('href')
                    if href:
                        if not href.startswith('http'):
                            href = f"{self.BASE_URL}{href}" if href.startswith('/') else f"{self.BASE_URL}/{href}"

                        print(f"Found PDF link: {href}")
                        cookies = {c['name']: c['value'] for c in self.page.context.cookies()}
                        response = requests.get(href, cookies=cookies, timeout=30)
                        if response.status_code == 200 and response.content[:4] == b'%PDF':
                            with open(save_path, 'wb') as f:
                                f.write(response.content)
                            print(f"Downloaded PDF from link: {save_path}")
                            return str(save_path)
            except Exception as e:
                print(f"Error downloading PDF via link: {e}")

            print("Could not download PDF")
            return None

        except Exception as e:
            print(f"Error downloading bill: {e}")
            import traceback
            traceback.print_exc()
            return None

    def fetch_bills(self, headless: bool = True) -> FetchResult:
        """
        Main method to fetch all bills from the portal.

        Args:
            headless: Run browser in headless mode

        Returns:
            FetchResult with accounts, bills, and any errors
        """
        result = FetchResult(success=False)

        with sync_playwright() as playwright:
            try:
                self._setup_browser(playwright, headless=headless)

                # Login
                if not self._login():
                    result.errors.append("Login failed")
                    return result

                # Navigate to home
                if not self._navigate_to_home():
                    result.errors.append("Could not navigate to home page")
                    return result

                # Expand account details to see bill info
                self._expand_account_details()

                # Get accounts
                accounts = self._get_accounts()
                result.accounts = accounts

                # Download bills for each account (or just the visible one)
                current_account = accounts[0].account_number if accounts else None
                pdf_path = self._download_bill_pdf(current_account)
                if pdf_path:
                    result.downloaded_pdfs.append(pdf_path)
                    try:
                        bill_data = parse_pdf(pdf_path)
                        result.bills.append(bill_data)
                    except Exception as e:
                        result.errors.append(f"Error parsing PDF {pdf_path}: {e}")

                result.success = len(result.bills) > 0 or len(result.accounts) > 0

            except Exception as e:
                result.errors.append(f"Scraper error: {str(e)}")
                import traceback
                traceback.print_exc()

            finally:
                if self.browser:
                    self.browser.close()

        return result


def main():
    """Main entry point for the scraper."""
    # Load environment variables
    env_path = Path(__file__).parent.parent.parent / ".env"
    if env_path.exists():
        load_dotenv(env_path)

    env_local = Path(__file__).parent.parent.parent / ".env.local"
    if env_local.exists():
        load_dotenv(env_local, override=True)

    username = os.getenv("WAKE_ELECTRIC_USER")
    password = os.getenv("WAKE_ELECTRIC_PASS")

    if not username or not password:
        print("Error: WAKE_ELECTRIC_USER and WAKE_ELECTRIC_PASS must be set in .env file")
        sys.exit(1)

    download_dir = Path(__file__).parent.parent.parent / "data" / "downloaded-bills" / "wake-electric"

    scraper = WakeElectricScraper(
        username=username,
        password=password,
        download_dir=str(download_dir),
    )

    headless = "--visible" not in sys.argv and "-v" not in sys.argv

    print(f"Starting Wake Electric scraper (headless={headless})...")
    result = scraper.fetch_bills(headless=headless)

    print("\n" + "="*60)
    print("FETCH RESULTS")
    print("="*60)
    print(f"\nSuccess: {result.success}")
    print(f"Accounts found: {len(result.accounts)}")
    print(f"Bills parsed: {len(result.bills)}")
    print(f"PDFs downloaded: {len(result.downloaded_pdfs)}")

    if result.errors:
        print(f"\nErrors:")
        for err in result.errors:
            print(f"  - {err}")

    if result.bills:
        print("\n" + "-"*60)
        print("BILLS:")
        print("-"*60)
        for bill in result.bills:
            print(f"\nAccount: {bill.account_number}")
            print(f"Address: {bill.service_address}")
            print(f"Type: {bill.document_type.value}")
            print(f"Amount Due: ${bill.amount_due:.2f}")
            if bill.due_date:
                print(f"Due Date: {bill.due_date}")
            if bill.billing_period_start and bill.billing_period_end:
                print(f"Billing Period: {bill.billing_period_start} to {bill.billing_period_end}")
            if bill.kwh_used:
                print(f"Usage: {bill.kwh_used} kWh")
            if bill.requires_attention:
                print(f"*** ATTENTION REQUIRED: {bill.attention_reason} ***")


if __name__ == "__main__":
    main()
