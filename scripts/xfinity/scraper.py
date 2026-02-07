"""
Xfinity utility bill scraper using Playwright.

Logs into the Xfinity portal and downloads bills for the account.
Portal URL: https://login.xfinity.com/login

Login flow:
1. Enter email
2. Click "Let's go"
3. Enter password
4. Click "Sign in"
5. Navigate to Billing & Pay > View bill and transaction history
6. Click Bill details
7. Click Statement PDF to download
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

# Add parent directory to path for lib imports
sys.path.insert(0, str(Path(__file__).parent.parent))
from lib.bill_storage import save_bill_pdf


class XfinityScraper:
    """Scraper for Xfinity portal."""

    BASE_URL = "https://www.xfinity.com"
    LOGIN_URL = "https://login.xfinity.com/login"

    def __init__(self, username: str, password: str, download_dir: str):
        self.username = username
        self.password = password
        self.download_dir = Path(download_dir)
        self.download_dir.mkdir(parents=True, exist_ok=True)
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
                provider="Xfinity",
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
        # Use spectrum's playwright browser cache if available
        import os
        project_root = Path(__file__).parent.parent.parent
        browser_paths = [
            project_root / "scripts" / "spectrum" / ".cache" / "ms-playwright",
            project_root / "scripts" / "enbridge-gas" / ".cache" / "ms-playwright",
            Path.home() / ".cache" / "ms-playwright",
        ]

        for bp in browser_paths:
            if bp.exists():
                os.environ["PLAYWRIGHT_BROWSERS_PATH"] = str(bp)
                break

        # Launch Chromium with stealth settings to avoid bot detection
        self.browser = playwright.chromium.launch(
            headless=headless,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--disable-dev-shm-usage",
                "--no-sandbox",
                "--disable-web-security",
                "--disable-features=IsolateOrigins,site-per-process",
            ]
        )

        self.context = self.browser.new_context(
            accept_downloads=True,
            viewport={"width": 1920, "height": 1080},
            user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            locale="en-US",
            timezone_id="America/Los_Angeles",
            # Permissions to appear more like a real browser
            permissions=["geolocation"],
        )

        # Remove automation indicators
        self.context.add_init_script("""
            // Remove webdriver property
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
            // Override plugins
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5]
            });
            // Override languages
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en']
            });
        """)
        self.page = self.context.new_page()

    def _login(self) -> bool:
        """Log into the Xfinity portal."""
        print(f"Navigating to login page: {self.LOGIN_URL}")

        # Navigate and wait for page to load
        self.page.goto(self.LOGIN_URL, timeout=60000)
        self.page.wait_for_timeout(5000)  # Wait for JS to initialize

        self.page.screenshot(path=str(self.download_dir / "01_login_page.png"))

        # Step 1: Enter email/username
        print("Entering email...")
        email_selectors = [
            'input[name="user"]',
            'input#user',
            'input[type="email"]',
            'input[type="text"]',
            'input[autocomplete="username"]',
        ]

        email_filled = False
        for selector in email_selectors:
            try:
                elem = self.page.query_selector(selector)
                if elem and elem.is_visible():
                    elem.fill(self.username)
                    email_filled = True
                    print(f"  Filled email using selector: {selector}")
                    break
            except Exception:
                continue

        if not email_filled:
            print("Could not find email input")
            self.page.screenshot(path=str(self.download_dir / "error_no_email_input.png"))
            return False

        # Human-like delay after typing
        self.page.wait_for_timeout(1500)
        self.page.screenshot(path=str(self.download_dir / "02_email_entered.png"))

        # Step 2: Click "Let's go" button
        print("Clicking 'Let's go' button...")
        lets_go_selectors = [
            'button:has-text("Let\'s go")',
            'button:has-text("Let")',
            'button[type="submit"]',
            '#sign_in',
            'button:has-text("Continue")',
            'button:has-text("Next")',
        ]

        lets_go_clicked = False
        for selector in lets_go_selectors:
            try:
                elem = self.page.query_selector(selector)
                if elem and elem.is_visible():
                    # Move mouse to element first, then click (more human-like)
                    elem.scroll_into_view_if_needed()
                    self.page.wait_for_timeout(500)
                    elem.click()
                    lets_go_clicked = True
                    print(f"  Clicked Let's go using selector: {selector}")
                    break
            except Exception:
                continue

        if not lets_go_clicked:
            print("Pressing Enter to submit email...")
            self.page.keyboard.press('Enter')

        # Longer wait for password page to load
        self.page.wait_for_timeout(5000)
        self.page.screenshot(path=str(self.download_dir / "03_after_lets_go.png"))

        # Step 3: Wait for password field and enter password
        print("Entering password...")
        try:
            self.page.wait_for_selector('input[type="password"]', timeout=15000)
        except PlaywrightTimeout:
            print("Timeout waiting for password field")
            self.page.screenshot(path=str(self.download_dir / "error_no_password_field.png"))
            return False

        password_selectors = [
            'input[name="passwd"]',
            'input#passwd',
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
            self.page.screenshot(path=str(self.download_dir / "error_no_password_input.png"))
            return False

        self.page.wait_for_timeout(500)
        self.page.screenshot(path=str(self.download_dir / "04_password_entered.png"))

        # Step 4: Click "Sign in" button
        print("Clicking 'Sign in' button...")
        sign_in_selectors = [
            'button:has-text("Sign in")',
            'button:has-text("Sign In")',
            'button[type="submit"]',
            '#sign_in',
            'input[type="submit"]',
        ]

        sign_in_clicked = False
        for selector in sign_in_selectors:
            try:
                elem = self.page.query_selector(selector)
                if elem and elem.is_visible():
                    elem.click()
                    sign_in_clicked = True
                    print(f"  Clicked Sign in using selector: {selector}")
                    break
            except Exception:
                continue

        if not sign_in_clicked:
            print("Pressing Enter to submit password...")
            self.page.keyboard.press('Enter')

        # Wait for login to complete
        print("Waiting for login to complete...")
        self.page.wait_for_timeout(8000)

        try:
            self.page.wait_for_load_state("networkidle", timeout=20000)
        except PlaywrightTimeout:
            pass

        self.page.screenshot(path=str(self.download_dir / "05_after_login.png"))

        # Check if login was successful
        current_url = self.page.url
        page_content = self.page.content()
        page_content_lower = page_content.lower()

        # Positive indicators of successful login
        success_indicators = [
            "thanks for being",
            "gold member",
            "member since",
            "your account",
            "my account",
            "payments",
            "billing",
        ]

        # Check for positive indicators first
        if any(indicator in page_content_lower for indicator in success_indicators):
            print(f"Login successful. Current URL: {current_url}")
            return True

        # Check for explicit error messages on login page
        if "login" in current_url.lower():
            error_indicators = [
                "incorrect password",
                "invalid password",
                "incorrect username",
                "invalid username",
                "authentication failed",
                "login failed",
            ]
            if any(err in page_content_lower for err in error_indicators):
                print("Login failed - invalid credentials")
                self.page.screenshot(path=str(self.download_dir / "error_login_failed.png"))
                return False

            # Check for verification requirements
            if "verify" in page_content_lower or "verification" in page_content_lower:
                print("Additional verification may be required")
                self.page.screenshot(path=str(self.download_dir / "verification_required.png"))
            elif "select your account" in page_content_lower:
                print("Account selection page detected")

        print(f"Login appears successful. Current URL: {current_url}")
        return True

    def _navigate_to_billing(self) -> bool:
        """Navigate to the billing/statements page."""
        print("Navigating to billing...")

        # Wait for page to fully load
        self.page.wait_for_timeout(3000)
        self.page.screenshot(path=str(self.download_dir / "06_post_login.png"))

        # Look for "Billing" or "Billing & Pay" in the navigation
        billing_selectors = [
            'a:has-text("Billing")',
            'button:has-text("Billing")',
            '[aria-label*="Billing"]',
            'a[href*="billing"]',
            '[data-testid*="billing"]',
            'span:has-text("Billing")',
        ]

        for selector in billing_selectors:
            try:
                elems = self.page.query_selector_all(selector)
                for elem in elems:
                    if elem.is_visible():
                        # Hover first for dropdown menus
                        elem.hover()
                        self.page.wait_for_timeout(1000)
                        print(f"  Hovered on Billing using: {selector}")
                        self.page.screenshot(path=str(self.download_dir / "07_billing_hover.png"))

                        # Look for "View bill" or transaction history link
                        view_bill_selectors = [
                            'a:has-text("View bill and transaction history")',
                            'a:has-text("View bill")',
                            'a:has-text("transaction history")',
                            'a[href*="bill"]',
                        ]

                        for vb_selector in view_bill_selectors:
                            try:
                                vb_elem = self.page.query_selector(vb_selector)
                                if vb_elem and vb_elem.is_visible():
                                    vb_elem.click()
                                    print(f"  Clicked View bill using: {vb_selector}")
                                    self.page.wait_for_timeout(3000)
                                    self.page.screenshot(path=str(self.download_dir / "08_bill_history.png"))
                                    return True
                            except Exception:
                                continue

                        # If no dropdown item found, click on Billing directly
                        elem.click()
                        print(f"  Clicked Billing using: {selector}")
                        self.page.wait_for_timeout(3000)
                        break
            except Exception:
                continue

        self.page.screenshot(path=str(self.download_dir / "08_billing_page.png"))

        # Try direct navigation to billing URL
        print("Trying direct navigation to billing URL...")
        try:
            self.page.goto("https://www.xfinity.com/billing/details", timeout=30000)
            self.page.wait_for_timeout(3000)
        except PlaywrightTimeout:
            pass

        self.page.screenshot(path=str(self.download_dir / "09_billing_details.png"))
        return True

    def _download_statement_pdf(self) -> Optional[str]:
        """Download the statement PDF."""
        print("Looking for statement PDF download...")

        # Look for "Bill details" link first
        bill_details_selectors = [
            'a:has-text("Bill details")',
            'button:has-text("Bill details")',
            'a:has-text("View bill details")',
            '[data-testid*="bill-details"]',
        ]

        for selector in bill_details_selectors:
            try:
                elem = self.page.query_selector(selector)
                if elem and elem.is_visible():
                    elem.click()
                    print(f"  Clicked Bill details using: {selector}")
                    self.page.wait_for_timeout(3000)
                    break
            except Exception:
                continue

        self.page.screenshot(path=str(self.download_dir / "10_bill_details.png"))

        # Look for "Statement PDF" download link
        pdf_selectors = [
            'a:has-text("Statement PDF")',
            'a:has-text("Download PDF")',
            'a:has-text("PDF")',
            'button:has-text("Statement PDF")',
            'a[href*=".pdf"]',
            '[aria-label*="PDF"]',
            '[aria-label*="download"]',
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
                        filename = f"xfinity_{timestamp}.pdf"
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
                                        filename = f"xfinity_{timestamp}.pdf"
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
        self.page.screenshot(path=str(self.download_dir / "error_no_pdf_found.png"))
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
            addr_match = re.search(r'(\d+\s+[A-Z][A-Z0-9\s]+(?:WAY|CT|ST|AVE|DR|RD|LN|BLVD|PL|CIR))\s*[,\s]+([A-Z]+)[,\s]+([A-Z]{2})\s+(\d{5})', page_text, re.IGNORECASE)
            if addr_match:
                service_address = f"{addr_match.group(1).strip()}, {addr_match.group(2).strip()}, {addr_match.group(3).strip()} {addr_match.group(4)}"
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

                # Download statement PDF
                pdf_path = self._download_statement_pdf()
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

    # Try different env var patterns
    username = os.getenv("XFINITY_INTERENT_USER") or os.getenv("XFINITY_INTERNET_USER") or os.getenv("XFINITY_USER")
    password = os.getenv("XFINITY_INTERENT_PASS") or os.getenv("XFINITY_INTERNET_PASS") or os.getenv("XFINITY_PASS")

    if not username or not password:
        print("Error: Xfinity credentials not found. Set one of:")
        print("  XFINITY_INTERENT_USER / XFINITY_INTERENT_PASS")
        print("  XFINITY_INTERNET_USER / XFINITY_INTERNET_PASS")
        print("  XFINITY_USER / XFINITY_PASS")
        sys.exit(1)

    # Download directory
    download_dir = Path(__file__).parent.parent.parent / "data" / "xfinity-bills"

    # Create scraper and fetch bills
    scraper = XfinityScraper(
        username=username,
        password=password,
        download_dir=str(download_dir),
    )

    # Run with visible browser for debugging
    headless = "--visible" not in sys.argv

    print(f"Starting Xfinity scraper (headless={headless})...")
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
