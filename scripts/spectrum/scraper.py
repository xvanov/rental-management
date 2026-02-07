"""
Spectrum utility bill scraper using Playwright.

Logs into the Spectrum portal and downloads bills for the account.
Portal URL: https://www.spectrum.net
Login URL: https://id.spectrum.net/login

Note: Spectrum has one account per address, each with its own login credentials.
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

from models import AccountInfo, FetchResult, InternetBillData
from parser import parse_pdf
from mfa_helper import get_mfa_code

# Add parent directory to path for lib imports
sys.path.insert(0, str(Path(__file__).parent.parent))
from lib.bill_storage import save_bill_pdf


class SpectrumScraper:
    """Scraper for Spectrum portal."""

    BASE_URL = "https://www.spectrum.net"
    LOGIN_URL = "https://id.spectrum.net/login"

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
                provider="Spectrum",
                billing_date=billing_date,
                pdf_content=pdf_content
            )
            print(f"  Copied to standard location: {standard_path}")
            return standard_path
        except Exception as e:
            print(f"  Warning: Could not copy to standard location: {e}")
            return pdf_path

    def _setup_browser(self, playwright, headless: bool = True):
        """Set up the browser with download handling and stealth options."""
        # Try Firefox first as it's less commonly detected
        try:
            self.browser = playwright.firefox.launch(headless=headless)
            self.context = self.browser.new_context(
                accept_downloads=True,
                viewport={"width": 1920, "height": 1080},
                locale="en-US",
                timezone_id="America/New_York",
            )
        except Exception:
            # Fall back to Chromium
            self.browser = playwright.chromium.launch(
                headless=headless,
                args=[
                    "--disable-blink-features=AutomationControlled",
                    "--no-sandbox",
                ]
            )
            self.context = self.browser.new_context(
                accept_downloads=True,
                viewport={"width": 1920, "height": 1080},
                user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                locale="en-US",
                timezone_id="America/New_York",
            )

        self.page = self.context.new_page()

        # Remove webdriver detection (Chromium only)
        try:
            self.page.add_init_script("""
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => undefined
                });
            """)
        except Exception:
            pass

    def _login(self) -> bool:
        """Log into the Spectrum portal."""
        print(f"Navigating to login page: {self.LOGIN_URL}")
        self.page.goto(self.LOGIN_URL, timeout=60000)
        self.page.wait_for_timeout(3000)

        # Check if we're on the account type selection page
        # This page shows "Sign in to Spectrum.net" and "Sign in to SpectrumBusiness.net"
        page_content = self.page.content()
        if "Sign in to Spectrum.net" in page_content or "Need to Sign In" in page_content:
            print("Found account type selection page, clicking 'Sign in to Spectrum.net'...")
            sign_in_selectors = [
                'text="Sign in to Spectrum.net"',
                'a:has-text("Sign in to Spectrum.net")',
                'div:has-text("Sign in to Spectrum.net")',
            ]
            for selector in sign_in_selectors:
                try:
                    elem = self.page.query_selector(selector)
                    if elem and elem.is_visible():
                        elem.click()
                        print(f"  Clicked using: {selector}")
                        self.page.wait_for_timeout(3000)
                        break
                except Exception:
                    continue

        # Check if we're on the "Your Account at Your Fingertips" page
        # This page has a "Sign In" button
        page_content = self.page.content()
        if "Your Account at Your Fingertips" in page_content or "Create a Username" in page_content:
            print("Found landing page, clicking 'Sign In' button...")
            sign_in_btn_selectors = [
                'a:has-text("Sign In")',
                'button:has-text("Sign In")',
                'a.btn:has-text("Sign In")',
                '[href*="sign-in"]',
            ]
            for selector in sign_in_btn_selectors:
                try:
                    elems = self.page.query_selector_all(selector)
                    for elem in elems:
                        if elem.is_visible():
                            elem.click()
                            print(f"  Clicked Sign In using: {selector}")
                            self.page.wait_for_timeout(3000)
                            break
                    else:
                        continue
                    break
                except Exception:
                    continue

        # Wait for login form
        try:
            # Wait for username input
            self.page.wait_for_selector('input[type="text"], input[name="username"], #username', timeout=20000)
        except PlaywrightTimeout:
            print("Could not find login form")
            self.page.screenshot(path=str(self.download_dir / "login_error.png"))
            return False

        # Fill credentials
        print("Filling login credentials...")

        # Try different selectors for username
        username_selectors = [
            'input[name="username"]',
            'input#username',
            'input[type="text"]',
            'input[autocomplete="username"]',
        ]

        username_filled = False
        for selector in username_selectors:
            try:
                elem = self.page.query_selector(selector)
                if elem and elem.is_visible():
                    elem.fill(self.username)
                    username_filled = True
                    print(f"  Filled username using selector: {selector}")
                    break
            except Exception:
                continue

        if not username_filled:
            print("Could not find username input")
            self.page.screenshot(path=str(self.download_dir / "no_username_input.png"))
            return False

        # Try different selectors for password
        password_selectors = [
            'input[name="password"]',
            'input#password',
            'input[type="password"]',
            'input[autocomplete="current-password"]',
        ]

        password_filled = False
        for selector in password_selectors:
            try:
                elem = self.page.query_selector(selector)
                if elem and elem.is_visible():
                    elem.fill(self.password)
                    password_filled = True
                    print(f"  Filled password using selector: {selector}")
                    break
            except Exception:
                continue

        if not password_filled:
            print("Could not find password input")
            self.page.screenshot(path=str(self.download_dir / "no_password_input.png"))
            return False

        # Click login button
        login_selectors = [
            'button[type="submit"]',
            'button:has-text("Sign In")',
            'button:has-text("Log In")',
            'input[type="submit"]',
            '#sign-in-btn',
        ]

        login_clicked = False
        for selector in login_selectors:
            try:
                elem = self.page.query_selector(selector)
                if elem and elem.is_visible():
                    elem.click()
                    login_clicked = True
                    print(f"  Clicked login using selector: {selector}")
                    break
            except Exception:
                continue

        if not login_clicked:
            print("Pressing Enter to submit form...")
            self.page.keyboard.press('Enter')

        # Wait for navigation
        self.page.wait_for_timeout(5000)
        try:
            self.page.wait_for_load_state("networkidle", timeout=15000)
        except PlaywrightTimeout:
            pass

        self.page.screenshot(path=str(self.download_dir / "after_login.png"))

        # Check if MFA is required
        current_url = self.page.url
        page_content = self.page.content().lower()

        if "verify" in current_url or "mfa" in current_url or "verification" in page_content or "security code" in page_content:
            print("MFA verification required")
            if not self._handle_mfa():
                return False

        # Check if login was successful
        current_url = self.page.url
        page_content = self.page.content()

        # Check for rate limiting or feature unavailable
        if "Feature Unavailable" in page_content or "IDID-4002" in page_content:
            print("Login failed - Feature unavailable (may be rate limited)")
            print("Try again later or verify you can log in manually")
            self.page.screenshot(path=str(self.download_dir / "login_failed.png"))
            return False

        if "login" in current_url.lower() or "sign-in" in current_url.lower():
            page_content_lower = page_content.lower()
            if "invalid" in page_content_lower or "incorrect" in page_content_lower:
                print("Login failed - invalid credentials")
                self.page.screenshot(path=str(self.download_dir / "login_failed.png"))
                return False

        print(f"Login successful. Current URL: {current_url}")
        return True

    def _handle_mfa(self) -> bool:
        """Handle MFA verification via email."""
        self.page.screenshot(path=str(self.download_dir / "mfa_page.png"))

        # Look for email option and select it
        # The page shows radio buttons: "Receive a Text Message", "Receive an Email", "Have Us Call You"
        print("Looking for email verification option...")
        email_selectors = [
            'label:has-text("Receive an Email")',
            'input[type="radio"][value="email"]',
            'label:has-text("Email")',
            'text="Receive an Email"',
        ]

        for selector in email_selectors:
            try:
                elem = self.page.query_selector(selector)
                if elem and elem.is_visible():
                    elem.click()
                    print(f"  Selected email option using: {selector}")
                    self.page.wait_for_timeout(500)
                    break
            except Exception:
                continue

        # Click Next button to send the code
        print("Looking for Next button to send code...")
        send_selectors = [
            'button:has-text("Next")',
            'button:has-text("Send Code")',
            'button:has-text("Send")',
            'button:has-text("Continue")',
            'button[type="submit"]',
        ]

        for selector in send_selectors:
            try:
                elem = self.page.query_selector(selector)
                if elem and elem.is_visible():
                    elem.click()
                    print(f"  Clicked Next/Send Code using: {selector}")
                    break
            except Exception:
                continue

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

        # Find and fill code input
        print(f"Entering MFA code: {code}")
        code_selectors = [
            'input[type="text"]',  # Generic text input
            'input[type="tel"]',
            'input[maxlength="6"]',
            'input[name="code"]',
            'input[name="verificationCode"]',
            'input[placeholder*="code"]',
        ]

        code_filled = False
        for selector in code_selectors:
            try:
                elems = self.page.query_selector_all(selector)
                for elem in elems:
                    if elem.is_visible():
                        elem.fill(code)
                        code_filled = True
                        print(f"  Filled code using: {selector}")
                        break
                if code_filled:
                    break
            except Exception:
                continue

        if not code_filled:
            print("Could not find code input field")
            self.page.screenshot(path=str(self.download_dir / "mfa_no_input.png"))
            return False

        # Click Next/Verify button
        verify_selectors = [
            'button:has-text("Next")',
            'button:has-text("Verify")',
            'button:has-text("Submit")',
            'button:has-text("Continue")',
            'button[type="submit"]',
        ]

        for selector in verify_selectors:
            try:
                elem = self.page.query_selector(selector)
                if elem and elem.is_visible():
                    elem.click()
                    print(f"  Clicked Next/Verify using: {selector}")
                    break
            except Exception:
                continue

        self.page.wait_for_timeout(5000)
        try:
            self.page.wait_for_load_state("networkidle", timeout=15000)
        except PlaywrightTimeout:
            pass

        self.page.screenshot(path=str(self.download_dir / "after_mfa.png"))

        # Check if MFA was successful
        current_url = self.page.url
        page_content = self.page.content().lower()

        # Check for explicit failure messages
        failure_indicators = [
            "invalid code",
            "incorrect code",
            "code expired",
            "try again",
            "code is incorrect",
            "verification failed",
        ]

        for indicator in failure_indicators:
            if indicator in page_content:
                print(f"MFA verification failed: found '{indicator}'")
                return False

        # Check for success indicators - we're logged in if we see dashboard elements
        success_indicators = [
            "spectrum.net/account",
            "spectrum.net/billing",
            "account-summary",
            "my account",
            "sign out",
            "log out",
        ]

        for indicator in success_indicators:
            if indicator in current_url.lower() or indicator in page_content:
                print(f"MFA verification successful (found: {indicator})")
                return True

        # If still on verify page with code input, it failed
        if "verify" in current_url and self.page.query_selector('input[type="text"]'):
            print("MFA verification failed - still on verification page")
            return False

        # Assume success if we navigated away from login/verify
        if "login" not in current_url.lower():
            print("MFA verification successful (navigated away from login)")
            return True

        print("MFA verification status unclear, assuming success")
        return True

    def _navigate_to_billing(self) -> bool:
        """Navigate to the billing/statements page."""
        print("Navigating to billing...")

        # Go to account summary which has billing link
        try:
            self.page.goto(f"{self.BASE_URL}/account-summary", timeout=30000)
            self.page.wait_for_timeout(3000)
        except PlaywrightTimeout:
            print("Timeout navigating to account summary")

        self.page.screenshot(path=str(self.download_dir / "account_summary.png"))

        # Look for Billing link/tab
        billing_selectors = [
            'a:has-text("Billing")',
            'a[href*="billing"]',
            'button:has-text("Billing")',
            '[data-testid*="billing"]',
        ]

        for selector in billing_selectors:
            try:
                elem = self.page.query_selector(selector)
                if elem and elem.is_visible():
                    elem.click()
                    print(f"  Clicked Billing using: {selector}")
                    self.page.wait_for_timeout(3000)
                    break
            except Exception:
                continue

        self.page.screenshot(path=str(self.download_dir / "billing_page.png"))

        # Look for Statements link
        statements_selectors = [
            'a:has-text("Statements")',
            'a[href*="statements"]',
            'button:has-text("Statements")',
            '[data-testid*="statements"]',
        ]

        for selector in statements_selectors:
            try:
                elem = self.page.query_selector(selector)
                if elem and elem.is_visible():
                    elem.click()
                    print(f"  Clicked Statements using: {selector}")
                    self.page.wait_for_timeout(3000)
                    break
            except Exception:
                continue

        self.page.screenshot(path=str(self.download_dir / "statements_page.png"))

        # Look for Internet statements
        internet_selectors = [
            'a:has-text("Internet")',
            'button:has-text("Internet")',
            '[data-testid*="internet"]',
        ]

        for selector in internet_selectors:
            try:
                elem = self.page.query_selector(selector)
                if elem and elem.is_visible():
                    elem.click()
                    print(f"  Clicked Internet using: {selector}")
                    self.page.wait_for_timeout(3000)
                    break
            except Exception:
                continue

        self.page.screenshot(path=str(self.download_dir / "internet_statements.png"))
        return True

    def _download_latest_statement(self) -> Optional[str]:
        """Download the most recent statement PDF."""
        print("Looking for statement links...")

        # The billing page shows statement rows under "Current Statement" and "Billing History"
        # Each row has "Statement" text with a date like "January 27, 2026"
        # We need to click on the first/current statement row

        statement_selectors = [
            # Current statement section - click on the statement row
            'section:has-text("Current Statement") >> div:has-text("Statement")',
            # Statement rows with dates
            'div:has-text("Statement"):has-text("2026") >> nth=0',
            'div:has-text("Statement"):has-text("2025") >> nth=0',
            # Clickable rows/links
            '[class*="statement"] >> nth=0',
            'a:has-text("Statement")',
            'button:has-text("Statement")',
            # Generic row selectors
            'div[role="button"]:has-text("Statement")',
            'li:has-text("Statement") >> nth=0',
        ]

        clicked = False
        for selector in statement_selectors:
            try:
                elem = self.page.query_selector(selector)
                if elem and elem.is_visible():
                    elem.click()
                    print(f"  Clicked statement using: {selector}")
                    clicked = True
                    self.page.wait_for_timeout(3000)
                    break
            except Exception as e:
                continue

        if not clicked:
            # Try clicking directly on text that looks like a statement link
            try:
                # Look for the current statement amount/date which is clickable
                current_stmt = self.page.locator('text="Statement"').first
                if current_stmt:
                    current_stmt.click()
                    print("  Clicked on 'Statement' text")
                    clicked = True
                    self.page.wait_for_timeout(3000)
            except Exception:
                pass

        self.page.screenshot(path=str(self.download_dir / "statement_detail.png"))

        # Look for "View Printable Statement" link that opens PDF
        pdf_selectors = [
            'a:has-text("View Printable Statement")',
            'a:has-text("Printable")',
            'a:has-text("PDF")',
            'a:has-text("Download")',
            'button:has-text("View Printable")',
        ]

        for selector in pdf_selectors:
            try:
                elem = self.page.query_selector(selector)
                if elem and elem.is_visible():
                    print(f"  Found PDF link using: {selector}")

                    # Try to trigger download
                    try:
                        with self.page.expect_download(timeout=30000) as download_info:
                            elem.click()
                        download = download_info.value
                        timestamp = datetime.now().strftime("%Y%m%d")
                        filename = f"spectrum_{timestamp}.pdf"
                        save_path = self.download_dir / filename
                        download.save_as(str(save_path))
                        print(f"Downloaded: {save_path}")
                        return str(save_path)
                    except PlaywrightTimeout:
                        # Check if new tab opened with PDF
                        pages = self.context.pages
                        if len(pages) > 1:
                            new_page = pages[-1]
                            new_url = new_page.url
                            print(f"New tab opened: {new_url}")

                            if '.pdf' in new_url.lower() or 'blob:' in new_url.lower():
                                # Download PDF via URL
                                cookies = {c['name']: c['value'] for c in self.context.cookies()}
                                try:
                                    response = requests.get(new_url, cookies=cookies, timeout=30)
                                    if response.status_code == 200 and response.content[:4] == b'%PDF':
                                        timestamp = datetime.now().strftime("%Y%m%d")
                                        filename = f"spectrum_{timestamp}.pdf"
                                        save_path = self.download_dir / filename
                                        with open(save_path, 'wb') as f:
                                            f.write(response.content)
                                        print(f"Downloaded from URL: {save_path}")
                                        new_page.close()
                                        return str(save_path)
                                except Exception as e:
                                    print(f"Error downloading from URL: {e}")

                            new_page.close()
                        else:
                            # Maybe it opened in same page or triggered download
                            elem.click()
                            self.page.wait_for_timeout(5000)

            except Exception as e:
                print(f"Error with selector {selector}: {e}")
                continue

        print("Could not find or download PDF")
        return None

    def _get_account_info(self) -> Optional[AccountInfo]:
        """Extract account info from the current page."""
        try:
            import re
            page_text = self.page.inner_text('body')

            # Extract account number
            account_match = re.search(r'(\d{4}\s+\d{2}\s+\d{3}\s+\d{7})', page_text)
            account_number = account_match.group(1) if account_match else "UNKNOWN"

            # Extract service address - look for address patterns
            addr_match = re.search(r'(\d+\s+[A-Z][A-Z0-9\s]+(?:CT|ST|AVE|DR|RD|LN|WAY|BLVD|PL|CIR))\s*\n?\s*([A-Z]+,?\s*[A-Z]{2}\s*\d{5})', page_text, re.IGNORECASE)
            if addr_match:
                service_address = f"{addr_match.group(1).strip()}, {addr_match.group(2).strip()}"
            else:
                service_address = "UNKNOWN"

            return AccountInfo(
                account_number=account_number,
                service_address=service_address,
            )
        except Exception as e:
            print(f"Error getting account info: {e}")
            return None

    def fetch_bills(self, headless: bool = True) -> FetchResult:
        """
        Main method to fetch bills from the portal.

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

                # Get account info
                account_info = self._get_account_info()
                if account_info:
                    result.accounts.append(account_info)

                # Navigate to billing
                self._navigate_to_billing()

                # Download latest statement
                pdf_path = self._download_latest_statement()
                if pdf_path:
                    result.downloaded_pdfs.append(pdf_path)

                    # Parse the PDF
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

    username = os.getenv("SPECTRUM_USER")
    password = os.getenv("SPECTRUM_PASS")

    if not username or not password:
        print("Error: SPECTRUM_USER and SPECTRUM_PASS must be set in .env or .env.local")
        sys.exit(1)

    # Download directory
    download_dir = Path(__file__).parent.parent.parent / "data" / "spectrum-bills"

    # Create scraper and fetch bills
    scraper = SpectrumScraper(
        username=username,
        password=password,
        download_dir=str(download_dir),
        auto_mfa="--no-auto-mfa" not in sys.argv,
    )

    # Run with visible browser for debugging
    headless = "--visible" not in sys.argv

    print(f"Starting Spectrum scraper (headless={headless})...")
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
            if bill.requires_attention:
                print(f"*** ATTENTION REQUIRED: {bill.attention_reason} ***")

    # Save results to JSON
    output_path = download_dir / f"fetch_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    download_dir.mkdir(parents=True, exist_ok=True)
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
