"""
Dominion Energy NC (Enbridge Gas) utility bill scraper using Playwright.

Logs into the Dominion Energy NC portal and downloads bills for all accounts.
Portal URL: https://account.dominionenergync.com
"""
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional
import json
import time

from playwright.sync_api import sync_playwright, Page, Browser, TimeoutError as PlaywrightTimeout
from dotenv import load_dotenv
import requests

from models import AccountInfo, FetchResult, GasBillData
from parser import parse_pdf
from mfa_helper import get_mfa_code, get_mfa_code_from_gmail

# Add parent directory to path for lib imports
sys.path.insert(0, str(Path(__file__).parent.parent))
from lib.bill_storage import save_bill_pdf


class EnbridgeGasScraper:
    """Scraper for Dominion Energy NC (Enbridge Gas) portal."""

    # Dominion Energy NC (Enbridge Gas North Carolina)
    BASE_URL = "https://account.dominionenergync.com"
    LOGIN_URL = "https://account.dominionenergync.com"

    def __init__(self, username: str, password: str, download_dir: str, auto_mfa: bool = True):
        self.username = username
        self.password = password
        self.download_dir = Path(download_dir)
        self.download_dir.mkdir(parents=True, exist_ok=True)
        self.auto_mfa = auto_mfa
        self.browser: Optional[Browser] = None
        self.page: Optional[Page] = None
        self.context = None

    def _copy_to_standard_location(self, pdf_path: str, service_address: str, billing_date: datetime = None) -> str:
        """Copy the PDF to the standardized bill storage location."""
        try:
            if not service_address:
                print(f"  Warning: No service address for standardized storage")
                return pdf_path

            if not billing_date:
                billing_date = datetime.now()

            with open(pdf_path, 'rb') as f:
                pdf_content = f.read()

            standard_path = save_bill_pdf(
                address=service_address,
                provider="Enbridge Gas",
                billing_date=billing_date,
                pdf_content=pdf_content
            )
            print(f"  Copied to standard location: {standard_path}")
            return standard_path
        except Exception as e:
            print(f"  Warning: Could not copy to standard location: {e}")
            return pdf_path

    def _setup_browser(self, playwright, headless: bool = True):
        """Set up the browser with download handling."""
        self.browser = playwright.chromium.launch(headless=headless)
        self.context = self.browser.new_context(
            accept_downloads=True,
            viewport={"width": 1920, "height": 1080},
        )
        self.page = self.context.new_page()

    def _login(self) -> bool:
        """Log into the Dominion Energy NC portal."""
        print(f"Navigating to login page: {self.LOGIN_URL}")
        self.page.goto(self.LOGIN_URL, timeout=30000)
        self.page.wait_for_timeout(3000)

        # Wait for login form
        try:
            self.page.wait_for_selector('input[name="user-name"]', timeout=15000)
        except PlaywrightTimeout:
            print("Could not find login form")
            self.page.screenshot(path=str(self.download_dir / "login_error.png"))
            return False

        # Fill credentials
        print("Filling login credentials...")
        self.page.fill('input[name="user-name"]', self.username)
        self.page.fill('input[type="password"]', self.password)

        # Click login button
        login_btn = self.page.query_selector('button.btn-primary')
        if login_btn:
            login_btn.click()
        else:
            self.page.keyboard.press('Enter')

        # Wait for navigation
        self.page.wait_for_timeout(3000)
        try:
            self.page.wait_for_load_state("networkidle", timeout=10000)
        except PlaywrightTimeout:
            pass

        self.page.screenshot(path=str(self.download_dir / "after_login.png"))

        # Check if MFA is required (URL contains #verify)
        if "#verify" in self.page.url:
            print("MFA verification required")
            if not self._handle_mfa():
                return False

        # Check if login was successful
        current_url = self.page.url
        if "login" in current_url.lower() or "access" in current_url.lower():
            page_content = self.page.content().lower()
            if "invalid" in page_content or "error" in page_content or "incorrect" in page_content:
                print("Login failed - invalid credentials")
                self.page.screenshot(path=str(self.download_dir / "login_failed.png"))
                return False

        print(f"Login successful. Current URL: {current_url}")
        return True

    def _handle_mfa(self) -> bool:
        """Handle MFA verification via email."""
        self.page.screenshot(path=str(self.download_dir / "mfa_page.png"))

        # Select email option (first radio button)
        print("Selecting email for MFA...")
        email_radio = self.page.query_selector('input[type="radio"]:first-of-type')
        if email_radio:
            email_radio.click()
            self.page.wait_for_timeout(500)

        # Click Send Code
        print("Clicking Send Code...")
        send_btn = self.page.query_selector('button:has-text("Send Code")')
        if not send_btn:
            print("Send Code button not found")
            return False

        send_btn.click()
        self.page.wait_for_timeout(3000)

        try:
            self.page.wait_for_load_state("networkidle", timeout=10000)
        except PlaywrightTimeout:
            pass

        self.page.screenshot(path=str(self.download_dir / "mfa_code_sent.png"))

        # Get MFA code
        print("Waiting for MFA code...")
        code = get_mfa_code(auto_email=self.auto_mfa)
        if not code:
            print("Failed to get MFA code")
            return False

        # Find and fill code input (text input without name)
        print(f"Entering MFA code: {code}")
        code_input = self.page.query_selector('input[type="text"]:not([name])')
        if not code_input:
            # Try other selectors
            code_input = self.page.query_selector('input[type="tel"], input[maxlength="6"]')

        if not code_input:
            print("Could not find code input field")
            self.page.screenshot(path=str(self.download_dir / "mfa_no_input.png"))
            return False

        code_input.fill(code)

        # Click Verify button
        verify_btn = self.page.query_selector('button:has-text("Verify")')
        if verify_btn:
            print("Clicking Verify...")
            verify_btn.click()
        else:
            self.page.keyboard.press('Enter')

        self.page.wait_for_timeout(5000)
        try:
            self.page.wait_for_load_state("networkidle", timeout=15000)
        except PlaywrightTimeout:
            pass

        self.page.screenshot(path=str(self.download_dir / "after_mfa.png"))

        # Check if MFA was successful
        if "#verify" in self.page.url:
            print("MFA verification failed - still on MFA page")
            return False

        print("MFA verification successful")
        return True

    def _get_accounts(self) -> list[AccountInfo]:
        """Get list of accounts from the portal."""
        accounts = []

        try:
            # Wait for page to load but don't use networkidle (can timeout)
            self.page.wait_for_timeout(3000)
            self.page.screenshot(path=str(self.download_dir / "dashboard.png"))

            # The dashboard shows "Select an Account" with clickable account rows
            # Each row has: location (city), address, account number, amount, Pay button

            # Look for account rows - they contain addresses with amounts
            import re
            page_text = self.page.inner_text('body')

            # Look for addresses (format: "1553 UNDERBRUSH DR")
            addr_matches = re.findall(r'(\d+[A-Z]?\s+[A-Z][A-Z0-9\s]+(?:DR|ST|AVE|CT|RD|LN|WAY|BLVD|PL|CIR)(?:\s+[A-Z])?)', page_text, re.IGNORECASE)

            # Look for account numbers (format: 7-2101-4365-2043) - might be hidden
            account_matches = re.findall(r'(\d-\d{4}-\d{4}-\d{4})', page_text)

            # Deduplicate addresses and filter out non-addresses
            seen_addrs = set()
            unique_addrs = []
            for addr in addr_matches:
                addr_clean = addr.strip().upper()
                # Skip if too short (likely not a real address) or already seen
                if len(addr_clean) < 10:
                    continue
                if addr_clean in seen_addrs:
                    continue
                # Skip footer/phone number artifacts
                if 'CONTACT' in addr_clean or 'HELP' in addr_clean:
                    continue
                seen_addrs.add(addr_clean)
                unique_addrs.append(addr.strip())

            for i, addr in enumerate(unique_addrs):
                acc_num = account_matches[i] if i < len(account_matches) else f"ACCOUNT_{i+1}"
                accounts.append(AccountInfo(
                    account_number=acc_num,
                    service_address=addr,
                ))
                print(f"  Found account: {addr}")

            print(f"Found {len(accounts)} accounts total")

        except Exception as e:
            print(f"Error getting accounts: {e}")
            import traceback
            traceback.print_exc()

        return accounts

    def _navigate_to_account(self, address: str) -> bool:
        """Click on an account/address to view its details."""
        try:
            print(f"Looking for account: {address}")

            # Try multiple selectors for the account row
            selectors_to_try = [
                f'text="{address}"',
                f'a:has-text("{address}")',
                f'div:has-text("{address}")',
                f'[class*="account"]:has-text("{address}")',
                f'[class*="address"]:has-text("{address}")',
            ]

            for selector in selectors_to_try:
                try:
                    elem = self.page.query_selector(selector)
                    if elem and elem.is_visible():
                        print(f"Found element with selector: {selector}")
                        elem.click()
                        self.page.wait_for_timeout(3000)
                        self.page.screenshot(path=str(self.download_dir / "account_detail.png"))
                        return True
                except Exception:
                    continue

            # Fallback: find elements containing the address text
            elements = self.page.query_selector_all('a, div, span, button')
            for elem in elements:
                try:
                    text = elem.inner_text()
                    if address.upper() in text.upper() and elem.is_visible():
                        print(f"Found address in element text")
                        elem.click()
                        self.page.wait_for_timeout(3000)
                        self.page.screenshot(path=str(self.download_dir / "account_detail.png"))
                        return True
                except:
                    continue

            print(f"Could not find clickable element for: {address}")

        except Exception as e:
            print(f"Error navigating to account: {e}")
            import traceback
            traceback.print_exc()

        return False

    def _download_bill_pdf(self, account_info: Optional[AccountInfo] = None) -> list[str]:
        """Download bill PDF for current account."""
        downloaded = []

        try:
            # Don't use networkidle - can timeout. Just wait a bit.
            self.page.wait_for_timeout(2000)
            self.page.screenshot(path=str(self.download_dir / "account_page.png"))

            # Look for "View Bill" links
            # Pattern from user: "View Bill - Jan, 2026"
            view_bill_links = self.page.query_selector_all('a:has-text("View Bill"), button:has-text("View Bill")')
            print(f"Found {len(view_bill_links)} View Bill links")

            for link in view_bill_links[:3]:  # Only try first 3
                try:
                    text = link.inner_text().strip()
                    print(f"Clicking: {text}")

                    # Try to trigger download
                    try:
                        with self.page.expect_download(timeout=30000) as download_info:
                            link.click()
                        download = download_info.value
                        timestamp = datetime.now().strftime("%Y%m%d")
                        account = account_info.account_number.replace('-', '') if account_info else 'unknown'
                        filename = f"enbridge_{account}_{timestamp}.pdf"
                        save_path = self.download_dir / filename
                        download.save_as(str(save_path))
                        print(f"Downloaded: {save_path}")
                        downloaded.append(str(save_path))
                        break  # Got one bill, done
                    except PlaywrightTimeout:
                        # Check if new tab opened with PDF
                        pages = self.context.pages
                        if len(pages) > 1:
                            new_page = pages[-1]
                            new_url = new_page.url
                            print(f"New tab opened: {new_url}")

                            if '.pdf' in new_url.lower():
                                # Download PDF via URL
                                cookies = {c['name']: c['value'] for c in self.context.cookies()}
                                response = requests.get(new_url, cookies=cookies, timeout=30)
                                if response.status_code == 200 and response.content[:4] == b'%PDF':
                                    timestamp = datetime.now().strftime("%Y%m%d")
                                    account = account_info.account_number.replace('-', '') if account_info else 'unknown'
                                    filename = f"enbridge_{account}_{timestamp}.pdf"
                                    save_path = self.download_dir / filename
                                    with open(save_path, 'wb') as f:
                                        f.write(response.content)
                                    print(f"Downloaded from URL: {save_path}")
                                    downloaded.append(str(save_path))
                            new_page.close()

                except Exception as e:
                    print(f"Error downloading bill: {e}")
                    continue

        except Exception as e:
            print(f"Error in bill download: {e}")
            import traceback
            traceback.print_exc()

        return downloaded

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

                # Get accounts
                accounts = self._get_accounts()
                result.accounts = accounts

                # For each account, try to download bill
                if accounts:
                    for account in accounts:
                        print(f"\nProcessing account: {account.account_number} ({account.service_address})")
                        if self._navigate_to_account(account.service_address):
                            pdfs = self._download_bill_pdf(account)
                            result.downloaded_pdfs.extend(pdfs)
                            # Go back to main page for next account
                            self.page.goto(self.BASE_URL, timeout=30000)
                            self.page.wait_for_timeout(3000)
                else:
                    # No accounts found, try downloading from current page
                    pdfs = self._download_bill_pdf()
                    result.downloaded_pdfs.extend(pdfs)

                # Parse all downloaded PDFs
                for pdf_path in result.downloaded_pdfs:
                    try:
                        bill_data = parse_pdf(pdf_path)
                        # Copy to standardized location
                        billing_date = bill_data.billing_period_end or bill_data.bill_date or datetime.now().date()
                        if isinstance(billing_date, str):
                            billing_date = datetime.strptime(billing_date, "%Y-%m-%d").date()
                        billing_datetime = datetime.combine(billing_date, datetime.min.time()) if hasattr(billing_date, 'year') else datetime.now()
                        std_path = self._copy_to_standard_location(pdf_path, bill_data.service_address, billing_datetime)
                        bill_data.pdf_path = std_path
                        result.bills.append(bill_data)
                    except Exception as e:
                        result.errors.append(f"Error parsing PDF {pdf_path}: {e}")

                result.success = len(result.bills) > 0 or len(result.downloaded_pdfs) > 0

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

    username = os.getenv("ENBRIDGE_GAS_USER") or os.getenv("DOMINION_GAS_USER")
    password = os.getenv("ENBRIDGE_GAS_PASS") or os.getenv("DOMINION_GAS_PASS")

    if not username or not password:
        print("Error: DOMINION_GAS_USER and DOMINION_GAS_PASS must be set in .env or .env.local")
        sys.exit(1)

    # Download directory
    download_dir = Path(__file__).parent.parent.parent / "data" / "enbridge-bills"

    # Create scraper and fetch bills
    scraper = EnbridgeGasScraper(
        username=username,
        password=password,
        download_dir=str(download_dir),
        auto_mfa="--no-auto-mfa" not in sys.argv,
    )

    # Run with visible browser for debugging
    headless = "--visible" not in sys.argv

    print(f"Starting Dominion Energy NC scraper (headless={headless})...")
    result = scraper.fetch_bills(headless=headless)

    # Output results
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
            if bill.therms_used:
                print(f"Therms Used: {bill.therms_used}")
            if bill.requires_attention:
                print(f"*** ATTENTION REQUIRED: {bill.attention_reason} ***")

    # Save results to JSON
    output_path = download_dir / f"fetch_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(output_path, 'w') as f:
        json.dump({
            "success": result.success,
            "timestamp": datetime.now().isoformat(),
            "accounts": [{"account_number": a.account_number, "service_address": a.service_address, "balance": a.current_balance} for a in result.accounts],
            "bills": [b.to_dict() for b in result.bills],
            "errors": result.errors,
            "downloaded_pdfs": result.downloaded_pdfs,
        }, f, indent=2)
    print(f"\nResults saved to: {output_path}")


if __name__ == "__main__":
    main()
