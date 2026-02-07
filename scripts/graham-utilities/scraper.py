"""
Graham Utilities scraper using Playwright.

Logs into the Edmunds WIPP portal and downloads bills for the account.
Portal URL: https://wipp.edmundsassoc.com/Wipp/?wippid=GRAM
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

from models import AccountInfo, FetchResult, GrahamBillData
from parser import parse_pdf

# Add parent directory to path for lib imports
sys.path.insert(0, str(Path(__file__).parent.parent))
from lib.bill_storage import save_bill_pdf


class GrahamUtilitiesScraper:
    """Scraper for Graham Utilities via Edmunds WIPP portal."""

    BASE_URL = "https://wipp.edmundsassoc.com/Wipp/"
    LOGIN_URL = f"{BASE_URL}?wippid=GRAM"

    def __init__(self, account_id: str, pin: str, download_dir: str):
        """
        Initialize the scraper.

        Args:
            account_id: Account ID in format "XXXXX-XX" (e.g., "50530-17")
            pin: Account PIN
            download_dir: Directory to save downloaded PDFs
        """
        self.account_id = account_id
        self.pin = pin
        self.download_dir = Path(download_dir)
        self.download_dir.mkdir(parents=True, exist_ok=True)
        self.browser: Optional[Browser] = None
        self.page: Optional[Page] = None

    def _copy_to_standard_location(self, pdf_path: str, service_location: str, billing_date: datetime = None) -> str:
        """Copy the PDF to the standardized bill storage location."""
        try:
            if not service_location:
                print(f"  Warning: No service location for standardized storage")
                return pdf_path

            if not billing_date:
                billing_date = datetime.now()

            with open(pdf_path, 'rb') as f:
                pdf_content = f.read()

            standard_path = save_bill_pdf(
                address=service_location,
                provider="Graham Utilities",
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
        context = self.browser.new_context(
            accept_downloads=True,
            viewport={"width": 1920, "height": 1080},
        )
        self.page = context.new_page()

    def _login(self) -> bool:
        """Log into the Graham Utilities portal."""
        print(f"Navigating to login page: {self.LOGIN_URL}")
        self.page.goto(self.LOGIN_URL, wait_until="networkidle")

        # Wait for page to load
        self.page.wait_for_timeout(2000)

        # The WIPP portal has account lookup at the bottom of the page
        # Account ID is split: first part before dash, second part after dash
        # Format: XXXXX-XX
        account_parts = self.account_id.split('-')
        if len(account_parts) != 2:
            print(f"Invalid account ID format: {self.account_id}")
            return False

        account_prefix = account_parts[0]  # e.g., "50530"
        account_suffix = account_parts[1]  # e.g., "17"

        print(f"Filling account info: {account_prefix}-{account_suffix}, PIN: ****")

        try:
            # Look for the account lookup section
            # The form should have fields for account number parts and PIN

            # Try to find the account ID fields
            # First field - account number prefix
            account_prefix_selectors = [
                'input[name*="AccountNumber"]',
                'input[name*="account"]',
                'input[id*="AccountNumber"]',
                'input[id*="account"]',
                '#txtAccountNumber',
                'input[type="text"]:first-of-type',
            ]

            # Screenshot for debugging
            self.page.screenshot(path=str(self.download_dir / "login_page.png"))

            # Find account lookup section - usually in a form at the bottom
            # Look for the specific input fields

            # First, let's look for all input fields
            inputs = self.page.query_selector_all('input[type="text"]')
            print(f"Found {len(inputs)} text input fields")

            # For WIPP portals, typically there are:
            # - Two fields for account number (prefix and suffix)
            # - One field for PIN

            if len(inputs) >= 3:
                # Try filling the fields directly
                # Find the fields by their attributes or position

                # Look for account number fields
                acct1 = self.page.query_selector('input[name="txtAccountNumber1"], input[name*="Account1"], input[id*="Account1"]')
                acct2 = self.page.query_selector('input[name="txtAccountNumber2"], input[name*="Account2"], input[id*="Account2"]')
                pin_field = self.page.query_selector('input[name="txtPIN"], input[name*="PIN"], input[id*="PIN"], input[type="password"]')

                if not acct1 or not acct2 or not pin_field:
                    # Try finding by placeholder or nearby text
                    # Look for fields in the "Utility Account Information" section
                    account_section = self.page.query_selector('text=Utility Account Information')
                    if account_section:
                        parent = account_section.evaluate_handle('el => el.closest("form") || el.parentElement.parentElement')
                        if parent:
                            section_inputs = self.page.query_selector_all('input[type="text"]')
                            if len(section_inputs) >= 2:
                                acct1 = section_inputs[0]
                                acct2 = section_inputs[1]
                            pwd_inputs = self.page.query_selector_all('input[type="password"]')
                            if pwd_inputs:
                                pin_field = pwd_inputs[0]

                if not acct1 or not acct2 or not pin_field:
                    # Last resort - find all inputs and guess
                    all_inputs = self.page.query_selector_all('input')
                    text_inputs = [inp for inp in all_inputs if inp.get_attribute('type') in [None, 'text', '']]
                    pwd_inputs = [inp for inp in all_inputs if inp.get_attribute('type') == 'password']

                    print(f"Found {len(text_inputs)} text inputs and {len(pwd_inputs)} password inputs")

                    # Usually the account fields are adjacent text fields
                    if len(text_inputs) >= 2 and len(pwd_inputs) >= 1:
                        acct1 = text_inputs[0]
                        acct2 = text_inputs[1]
                        pin_field = pwd_inputs[0]

                if acct1 and acct2 and pin_field:
                    print("Found all fields, filling credentials...")
                    acct1.fill(account_prefix)
                    self.page.wait_for_timeout(200)
                    acct2.fill(account_suffix)
                    self.page.wait_for_timeout(200)
                    pin_field.fill(self.pin)
                    self.page.wait_for_timeout(200)

                    # Submit - look for submit button or press Enter
                    submit_btn = self.page.query_selector('input[type="submit"], button[type="submit"], input[value*="Submit"], input[value*="Login"], button:has-text("Submit"), button:has-text("Login")')

                    if submit_btn and submit_btn.is_visible():
                        print("Clicking submit button...")
                        submit_btn.click()
                    else:
                        print("Pressing Enter to submit...")
                        pin_field.press('Enter')

                    # Wait for navigation
                    try:
                        self.page.wait_for_load_state("networkidle", timeout=15000)
                    except PlaywrightTimeout:
                        pass

                    self.page.wait_for_timeout(2000)
                    self.page.screenshot(path=str(self.download_dir / "after_login.png"))

                    # Check if login was successful
                    page_content = self.page.content().lower()
                    current_url = self.page.url

                    # Look for indicators of successful login
                    if "view current bill" in page_content or "current bill" in page_content or "account balance" in page_content:
                        print("Login successful!")
                        return True
                    elif "invalid" in page_content or "incorrect" in page_content or "error" in page_content:
                        print("Login failed - invalid credentials")
                        return False
                    else:
                        # Might still be successful, check for bill viewing elements
                        print(f"Login status unclear, current URL: {current_url}")
                        return True  # Proceed and see if we can view bills
                else:
                    print("Could not find all required fields")
                    return False
            else:
                print("Could not find enough input fields")
                return False

        except Exception as e:
            print(f"Login error: {e}")
            import traceback
            traceback.print_exc()
            self.page.screenshot(path=str(self.download_dir / "login_error.png"))
            return False

    def _download_current_bill(self) -> Optional[str]:
        """Download the current bill PDF."""
        print("Looking for 'View Current Bill' button...")

        try:
            self.page.wait_for_load_state("networkidle")
            self.page.screenshot(path=str(self.download_dir / "before_bill_view.png"))

            # Look for "View Current Bill" button/link
            view_bill_selectors = [
                'a:has-text("View Current Bill")',
                'button:has-text("View Current Bill")',
                'input[value*="View Current Bill"]',
                'a:has-text("Current Bill")',
                'a:has-text("View Bill")',
                'input[value*="View Bill"]',
                'a[href*="ViewBill"]',
                'a[href*="viewbill"]',
                'a[onclick*="ViewBill"]',
            ]

            view_bill_btn = None
            for selector in view_bill_selectors:
                try:
                    btn = self.page.query_selector(selector)
                    if btn and btn.is_visible():
                        view_bill_btn = btn
                        print(f"Found view bill button with selector: {selector}")
                        break
                except Exception:
                    continue

            if not view_bill_btn:
                print("Could not find 'View Current Bill' button")
                # Try finding any link that might lead to bill viewing
                all_links = self.page.query_selector_all('a')
                for link in all_links:
                    text = link.inner_text().lower()
                    if 'bill' in text or 'view' in text:
                        print(f"Found potential link: {text}")
                return None

            # Click the view bill button - this typically opens PDF in new tab
            print("Clicking 'View Current Bill'...")

            # Handle popup/new tab
            with self.page.context.expect_page() as new_page_info:
                view_bill_btn.click()

            new_page = new_page_info.value
            new_page.wait_for_load_state("networkidle", timeout=30000)

            # Get the PDF URL from the new page
            pdf_url = new_page.url
            print(f"New page URL: {pdf_url}")

            # Check if it's a PDF
            if pdf_url.endswith('.pdf') or 'pdf' in pdf_url.lower():
                # Download the PDF
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                filename = f"graham_{self.account_id}_{timestamp}.pdf"
                save_path = self.download_dir / filename

                # Get cookies for authenticated download
                cookies = {c['name']: c['value'] for c in self.page.context.cookies()}

                response = requests.get(pdf_url, cookies=cookies, timeout=30)
                if response.status_code == 200 and (response.content[:4] == b'%PDF' or len(response.content) > 1000):
                    with open(save_path, 'wb') as f:
                        f.write(response.content)
                    print(f"Downloaded PDF: {save_path}")
                    new_page.close()
                    return str(save_path)
                else:
                    print(f"Failed to download PDF: status={response.status_code}")
            else:
                # The page might be rendering the PDF or have a download link
                # Look for download button or PDF embed
                self.page.wait_for_timeout(2000)

                # Try to find PDF in the response or embedded
                try:
                    # Check if it's a direct PDF response
                    response = new_page.request

                    # Look for download button in the new page
                    download_btn = new_page.query_selector('a[download], a[href*=".pdf"], button:has-text("Download")')
                    if download_btn:
                        href = download_btn.get_attribute('href')
                        if href:
                            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                            filename = f"graham_{self.account_id}_{timestamp}.pdf"
                            save_path = self.download_dir / filename

                            if href.startswith('/'):
                                href = f"https://wipp.edmundsassoc.com{href}"

                            cookies = {c['name']: c['value'] for c in self.page.context.cookies()}
                            response = requests.get(href, cookies=cookies, timeout=30)
                            if response.status_code == 200:
                                with open(save_path, 'wb') as f:
                                    f.write(response.content)
                                print(f"Downloaded PDF via link: {save_path}")
                                new_page.close()
                                return str(save_path)
                except Exception as e:
                    print(f"Error getting PDF from new page: {e}")

                # If still no luck, try triggering download
                try:
                    with new_page.expect_download(timeout=10000) as download_info:
                        # Try clicking anywhere that might trigger download
                        new_page.keyboard.press('Control+s')
                    download = download_info.value
                    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                    filename = f"graham_{self.account_id}_{timestamp}.pdf"
                    save_path = self.download_dir / filename
                    download.save_as(str(save_path))
                    print(f"Downloaded PDF via save: {save_path}")
                    new_page.close()
                    return str(save_path)
                except Exception:
                    pass

                new_page.close()

            return None

        except Exception as e:
            print(f"Error downloading bill: {e}")
            import traceback
            traceback.print_exc()
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

                # Download the current bill
                pdf_path = self._download_current_bill()

                if pdf_path:
                    result.downloaded_pdfs.append(pdf_path)

                    # Parse the downloaded PDF
                    try:
                        bill_data = parse_pdf(pdf_path)
                        # Copy to standardized location
                        billing_date = bill_data.billing_period_end or bill_data.bill_date or datetime.now().date()
                        if isinstance(billing_date, str):
                            billing_date = datetime.strptime(billing_date, "%Y-%m-%d").date()
                        billing_datetime = datetime.combine(billing_date, datetime.min.time()) if hasattr(billing_date, 'year') else datetime.now()
                        std_path = self._copy_to_standard_location(pdf_path, bill_data.service_location, billing_datetime)
                        bill_data.pdf_path = std_path
                        result.bills.append(bill_data)

                        # Add account info
                        result.accounts.append(AccountInfo(
                            account_number=bill_data.account_number,
                            service_location=bill_data.service_location,
                            current_balance=bill_data.amount_due,
                        ))
                    except Exception as e:
                        result.errors.append(f"Error parsing PDF: {e}")
                else:
                    result.errors.append("Could not download bill PDF")

                result.success = len(result.bills) > 0

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

    account_id = os.getenv("GRAHAM_UTILITIES_ACCOUNT")
    pin = os.getenv("GRAHAM_UTILITIES_PIN")

    if not account_id or not pin:
        print("Error: GRAHAM_UTILITIES_ACCOUNT and GRAHAM_UTILITIES_PIN must be set in .env file")
        sys.exit(1)

    # Download directory
    download_dir = Path(__file__).parent.parent.parent / "data" / "graham-bills"

    # Create scraper and fetch bills
    scraper = GrahamUtilitiesScraper(
        account_id=account_id,
        pin=pin,
        download_dir=str(download_dir),
    )

    # Run with visible browser for debugging
    headless = "--visible" not in sys.argv and "-v" not in sys.argv

    print(f"Starting Graham Utilities scraper (headless={headless})...")
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
            print(f"Location: {bill.service_location}")
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
    with open(output_path, 'w') as f:
        json.dump({
            "success": result.success,
            "timestamp": datetime.now().isoformat(),
            "accounts": [{"account_number": a.account_number, "service_location": a.service_location, "balance": a.current_balance} for a in result.accounts],
            "bills": [b.to_dict() for b in result.bills],
            "errors": result.errors,
            "downloaded_pdfs": result.downloaded_pdfs,
        }, f, indent=2)
    print(f"\nResults saved to: {output_path}")


if __name__ == "__main__":
    main()
