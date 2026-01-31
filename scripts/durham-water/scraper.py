"""
Durham Water utility bill scraper using Playwright.

Logs into the Durham water utility portal and downloads bills for all accounts.
"""
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional
import json

from playwright.sync_api import sync_playwright, Page, Browser, TimeoutError as PlaywrightTimeout
from dotenv import load_dotenv
import requests

from models import AccountInfo, FetchResult, WaterBillData
from parser import parse_pdf


class DurhamWaterScraper:
    """Scraper for Durham Water utility portal."""

    BASE_URL = "https://billpay.onlinebiller.com/ebpp/durhamub"
    LOGIN_URL = f"{BASE_URL}/Login/Index"
    BILLPAY_URL = f"{BASE_URL}/BillPay"

    def __init__(self, username: str, password: str, download_dir: str):
        self.username = username
        self.password = password
        self.download_dir = Path(download_dir)
        self.download_dir.mkdir(parents=True, exist_ok=True)
        self.browser: Optional[Browser] = None
        self.page: Optional[Page] = None

    def _setup_browser(self, playwright, headless: bool = True):
        """Set up the browser with download handling."""
        self.browser = playwright.chromium.launch(headless=headless)
        context = self.browser.new_context(
            accept_downloads=True,
            viewport={"width": 1920, "height": 1080},
        )
        self.page = context.new_page()

    def _login(self) -> bool:
        """Log into the Durham Water portal."""
        print(f"Navigating to login page: {self.LOGIN_URL}")
        self.page.goto(self.LOGIN_URL, wait_until="networkidle")

        # Wait for login form
        try:
            self.page.wait_for_selector('input[type="text"], input[name="username"], #username, input[name="Username"]', timeout=10000)
        except PlaywrightTimeout:
            print("Could not find username field")
            return False

        # Find and fill username field
        username_selectors = [
            'input[name="username"]',
            'input[name="Username"]',
            '#username',
            '#Username',
            'input[type="text"]',
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
            self.page.screenshot(path=str(self.download_dir / "login_error.png"))
            return False

        # Find password field
        password_selectors = [
            'input[name="password"]',
            'input[name="Password"]',
            '#password',
            '#Password',
            'input[type="password"]',
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
            self.page.screenshot(path=str(self.download_dir / "login_error.png"))
            return False

        # Fill credentials
        print("Filling login credentials...")
        username_field.fill(self.username)
        password_field.fill(self.password)

        # Find and click login button
        login_selectors = [
            'button[type="submit"]',
            'input[type="submit"]',
            'button:has-text("Login")',
            'button:has-text("Sign In")',
            'button:has-text("Log In")',
            '.login-btn',
            '#loginBtn',
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
            self.page.wait_for_load_state("networkidle", timeout=15000)
        except PlaywrightTimeout:
            pass

        # Check if login was successful by looking for account info or error
        current_url = self.page.url
        page_content = self.page.content().lower()

        if "login" in current_url.lower() and ("error" in page_content or "invalid" in page_content):
            print("Login failed - invalid credentials")
            self.page.screenshot(path=str(self.download_dir / "login_failed.png"))
            return False

        print(f"Login appears successful. Current URL: {current_url}")
        return True

    def _get_accounts(self) -> list[AccountInfo]:
        """Get list of accounts from the portal."""
        accounts = []

        try:
            self.page.wait_for_load_state("networkidle")
            self.page.screenshot(path=str(self.download_dir / "accounts_page.png"))

            # Look for account header rows (contain "Account Number XXXX")
            # These are the expandable rows with account info
            account_rows = self.page.query_selector_all('tr:has-text("Account Number")')

            for row in account_rows:
                try:
                    text = row.inner_text()
                    import re

                    # Extract 12-digit account number
                    account_match = re.search(r'Account Number\s*(\d{12})', text)
                    if not account_match:
                        continue

                    account_num = account_match.group(1)

                    # Extract address (line after account number)
                    lines = text.strip().split('\n')
                    address = ""
                    for line in lines:
                        line = line.strip()
                        # Address typically starts with a number
                        if re.match(r'^\d+\s+[A-Z]', line, re.IGNORECASE):
                            address = line
                            break

                    accounts.append(AccountInfo(
                        account_number=account_num,
                        service_location=address or "Unknown",
                        current_balance=0.0,
                    ))
                except Exception as e:
                    print(f"Error parsing account row: {e}")
                    continue

        except Exception as e:
            print(f"Error getting accounts: {e}")

        return accounts

    def _download_all_bill_pdfs(self) -> list[str]:
        """Download all bill PDFs from the current page."""
        downloaded = []

        try:
            self.page.wait_for_load_state("networkidle")
            self.page.screenshot(path=str(self.download_dir / "before_download.png"))

            # The page uses div.invoice elements (not tables)
            # Each invoice row has a "View Invoice" button with class="view"
            print("Looking for invoice rows and View buttons...")

            # Find all invoice row divs
            invoice_rows = self.page.query_selector_all('div.invoice[data-id]')
            print(f"Found {len(invoice_rows)} invoice rows")

            # Collect all invoices grouped by account
            invoices_by_account = {}
            for row in invoice_rows:
                try:
                    invoice_id = row.get_attribute('data-id')
                    amount = row.get_attribute('data-amountdue')
                    statement_date = row.get_attribute('data-statementdate')
                    account = row.get_attribute('data-decryptrefrence')

                    view_btn = row.query_selector('button.view')
                    if view_btn and view_btn.is_visible():
                        invoice_data = {
                            'id': invoice_id,
                            'account': account,
                            'amount': amount,
                            'date': statement_date,
                            'button': view_btn
                        }

                        if account not in invoices_by_account:
                            invoices_by_account[account] = []
                        invoices_by_account[account].append(invoice_data)

                except Exception as e:
                    print(f"Error processing invoice row: {e}")

            # Select only the LATEST invoice for each account (by date)
            invoice_buttons = []
            for account, invoices in invoices_by_account.items():
                # Sort by date descending (latest first)
                # Date format is M/D/YYYY
                def parse_date(d):
                    try:
                        parts = d.split('/')
                        return (int(parts[2]), int(parts[0]), int(parts[1]))  # (year, month, day)
                    except:
                        return (0, 0, 0)

                invoices_sorted = sorted(invoices, key=lambda x: parse_date(x['date']), reverse=True)
                latest = invoices_sorted[0]

                print(f"Account {account}: {len(invoices)} bills, latest: {latest['date']} (${latest['amount']})")
                invoice_buttons.append((latest['button'], {
                    'id': latest['id'],
                    'account': latest['account'],
                    'amount': latest['amount'],
                    'date': latest['date']
                }))

            invoice_links = invoice_buttons

            print(f"Found {len(invoice_links)} View Invoice buttons")

            for i, (btn, info) in enumerate(invoice_links):
                try:
                    print(f"Clicking View button for invoice {info['id']} (account {info['account']}, ${info['amount']})...")

                    btn.scroll_into_view_if_needed()
                    self.page.wait_for_timeout(300)

                    # Click the view button - this opens a modal with an iframe
                    btn.click()

                    # Wait for the modal to appear and PDF to load
                    self.page.wait_for_timeout(3000)

                    # Look for download button in the modal
                    download_selectors = [
                        '.modal.in a[download]',
                        '.modal.in a:has-text("Download")',
                        '.modal.in button:has-text("Download")',
                        '.modal.in [title*="download" i]',
                        '.modal.in [title*="Download" i]',
                        '.modal.in .download',
                        '#modal-invoice-pdf a[download]',
                        '#modal-invoice-pdf a[href*="download"]',
                    ]

                    download_btn = None
                    for selector in download_selectors:
                        download_btn = self.page.query_selector(selector)
                        if download_btn and download_btn.is_visible():
                            print(f"Found download button with selector: {selector}")
                            break

                    pdf_downloaded = False

                    # First try: Look for download button in the modal (outside iframe)
                    if download_btn:
                        try:
                            with self.page.expect_download(timeout=30000) as download_info:
                                download_btn.click()
                            download = download_info.value
                            timestamp = datetime.now().strftime("%Y%m%d")
                            account = info['account'] or 'unknown'
                            filename = f"{account}_{timestamp}_{info['id']}.pdf"
                            save_path = self.download_dir / filename
                            download.save_as(str(save_path))
                            print(f"Downloaded via modal button: {save_path}")
                            downloaded.append(str(save_path))
                            pdf_downloaded = True
                        except Exception as de:
                            print(f"Modal download button failed: {de}")

                    # Second try: Look inside the iframe for download button
                    if not pdf_downloaded:
                        iframe = self.page.query_selector('iframe#bill-view-frame')
                        if iframe:
                            frame = iframe.content_frame()
                            if frame:
                                print("Checking inside iframe for download button...")
                                self.page.wait_for_timeout(2000)  # Wait for PDF viewer to load

                                # Look for download button in PDF viewer (common selectors)
                                iframe_download_selectors = [
                                    'button[title*="download" i]',
                                    'button[title*="Download" i]',
                                    'a[title*="download" i]',
                                    '[aria-label*="download" i]',
                                    '#download',
                                    '.download',
                                    'button:has-text("Download")',
                                    'a[download]',
                                ]

                                for selector in iframe_download_selectors:
                                    try:
                                        dl_btn = frame.query_selector(selector)
                                        if dl_btn and dl_btn.is_visible():
                                            print(f"Found iframe download button: {selector}")
                                            with self.page.expect_download(timeout=30000) as download_info:
                                                dl_btn.click()
                                            download = download_info.value
                                            timestamp = datetime.now().strftime("%Y%m%d")
                                            account = info['account'] or 'unknown'
                                            filename = f"{account}_{timestamp}_{info['id']}.pdf"
                                            save_path = self.download_dir / filename
                                            download.save_as(str(save_path))
                                            print(f"Downloaded via iframe button: {save_path}")
                                            downloaded.append(str(save_path))
                                            pdf_downloaded = True
                                            break
                                    except Exception as e:
                                        continue

                                # If still no download, try to find PDF URL in iframe
                                if not pdf_downloaded:
                                    print("Looking for PDF URL in iframe...")
                                    # Check for embed or object element
                                    pdf_embed = frame.query_selector('embed[type*="pdf"], object[type*="pdf"], embed[src*=".pdf"], object[data*=".pdf"]')
                                    if pdf_embed:
                                        pdf_url = pdf_embed.get_attribute('src') or pdf_embed.get_attribute('data')
                                        if pdf_url:
                                            print(f"Found PDF URL: {pdf_url[:80]}")
                                            if pdf_url.startswith('/'):
                                                pdf_url = f"https://billpay.onlinebiller.com{pdf_url}"
                                            cookies = {c['name']: c['value'] for c in self.page.context.cookies()}
                                            response = requests.get(pdf_url, cookies=cookies, timeout=30)
                                            if response.status_code == 200 and response.content[:4] == b'%PDF':
                                                timestamp = datetime.now().strftime("%Y%m%d")
                                                account = info['account'] or 'unknown'
                                                filename = f"{account}_{timestamp}_{info['id']}.pdf"
                                                save_path = self.download_dir / filename
                                                with open(save_path, 'wb') as f:
                                                    f.write(response.content)
                                                print(f"Downloaded PDF directly: {save_path}")
                                                downloaded.append(str(save_path))
                                                pdf_downloaded = True
                        else:
                            print("No iframe found")

                    if not pdf_downloaded:
                        print(f"Could not download PDF for invoice {info['id']}")

                    # Close the modal
                    close_btn = self.page.query_selector('.modal.in .close, .modal.in button[data-dismiss="modal"]')
                    if close_btn:
                        close_btn.click()
                        self.page.wait_for_timeout(500)
                    else:
                        # Press Escape to close
                        self.page.keyboard.press('Escape')
                        self.page.wait_for_timeout(500)

                except Exception as e:
                    print(f"Error on invoice {info['id']}: {e}")
                    # Try to close any open modal
                    try:
                        self.page.keyboard.press('Escape')
                    except:
                        pass

        except Exception as e:
            print(f"Error: {e}")
            import traceback
            traceback.print_exc()

        return downloaded

    def _navigate_to_all_bills(self) -> bool:
        """Navigate to view ALL bills (not just unpaid)."""
        try:
            self.page.wait_for_load_state("networkidle")
            self.page.wait_for_timeout(2000)

            # Navigate to All bills view
            # Try direct URL first
            current_url = self.page.url
            if "View=All" not in current_url:
                print("Navigating to All bills view...")
                self.page.goto("https://billpay.onlinebiller.com/ebpp/durhamub/BillPay?View=All")
                self.page.wait_for_load_state("networkidle")
                self.page.wait_for_timeout(3000)

            # Also try clicking the dropdown to select "All"
            dropdown = self.page.query_selector('a.invoice-selector, button.invoice-selector, [class*="invoice-selector"]')
            if dropdown:
                dropdown.click()
                self.page.wait_for_timeout(500)
                all_option = self.page.query_selector('a[href*="View=All"], a:has-text("All")')
                if all_option:
                    all_option.click()
                    self.page.wait_for_load_state("networkidle")
                    self.page.wait_for_timeout(2000)
                    print("Selected 'All' from dropdown")

            print(f"Current URL: {self.page.url}")
            return True

        except Exception as e:
            print(f"Error navigating to all bills: {e}")
            return False

    def _scrape_bills_from_page(self) -> list[dict]:
        """Scrape bill information directly from the page."""
        bills = []

        try:
            # Take screenshot
            self.page.screenshot(path=str(self.download_dir / "bills_page.png"))

            # Get page HTML for analysis
            html = self.page.content()

            # Look for bill rows/items
            # Try to find structured data
            bill_rows = self.page.query_selector_all('[class*="bill"], [class*="account"], tr, .row')

            for row in bill_rows:
                try:
                    text = row.inner_text()
                    # Look for patterns indicating a bill entry
                    import re

                    # Must have account number
                    account_match = re.search(r'(\d{12})', text)
                    if not account_match:
                        continue

                    bill_data = {
                        "account_number": account_match.group(1),
                        "raw_text": text,
                    }

                    # Extract address
                    addr_match = re.search(r'(\d+\s+[A-Z0-9\s]+(?:ST|AVE|DR|CT|RD|LN|WAY|BLVD|PL)(?:\s+[A-Z])?)', text, re.IGNORECASE)
                    if addr_match:
                        bill_data["service_location"] = addr_match.group(1).strip()

                    # Extract amount
                    amount_match = re.search(r'\$\s*([\d,]+\.?\d*)', text)
                    if amount_match:
                        try:
                            bill_data["amount"] = float(amount_match.group(1).replace(',', ''))
                        except ValueError:
                            pass

                    # Extract dates
                    date_matches = re.findall(r'(\d{1,2}/\d{1,2}/\d{2,4})', text)
                    if date_matches:
                        bill_data["dates"] = date_matches

                    bills.append(bill_data)

                except Exception as e:
                    continue

        except Exception as e:
            print(f"Error scraping bills from page: {e}")

        return bills

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

                # Navigate to all bills
                self._navigate_to_all_bills()

                # Get accounts
                accounts = self._get_accounts()
                result.accounts = accounts
                print(f"Found {len(accounts)} accounts")

                # Download all bill PDFs from the page
                downloaded_pdfs = self._download_all_bill_pdfs()
                result.downloaded_pdfs = downloaded_pdfs

                # Parse all downloaded PDFs
                for pdf_path in downloaded_pdfs:
                    try:
                        bill_data = parse_pdf(pdf_path)
                        result.bills.append(bill_data)
                    except Exception as e:
                        result.errors.append(f"Error parsing PDF {pdf_path}: {e}")

                # If no PDFs downloaded, try scraping from page
                if not result.downloaded_pdfs:
                    print("No PDFs downloaded, attempting to scrape data from page...")
                    page_bills = self._scrape_bills_from_page()
                    for bill in page_bills:
                        # Create WaterBillData from scraped info
                        from models import DocumentType
                        bill_data = WaterBillData(
                            document_type=DocumentType.UNKNOWN,
                            account_number=bill.get("account_number", "UNKNOWN"),
                            service_location=bill.get("service_location", "UNKNOWN"),
                            amount_due=bill.get("amount", 0.0),
                            requires_attention=True,
                            attention_reason="Data scraped from web page - PDF download failed",
                        )
                        result.bills.append(bill_data)

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
    else:
        # Try .env.local
        env_local = Path(__file__).parent.parent.parent / ".env.local"
        if env_local.exists():
            load_dotenv(env_local)

    username = os.getenv("DURHAM_WATER_USER")
    password = os.getenv("DURHAM_WATER_PASS")

    if not username or not password:
        print("Error: DURHAM_WATER_USER and DURHAM_WATER_PASS must be set in .env file")
        sys.exit(1)

    # Download directory
    download_dir = Path(__file__).parent.parent.parent / "data" / "downloaded-bills"

    # Create scraper and fetch bills
    scraper = DurhamWaterScraper(
        username=username,
        password=password,
        download_dir=str(download_dir),
    )

    # Run with visible browser for debugging (set headless=True for production)
    headless = "--headless" in sys.argv or "-h" not in sys.argv

    print(f"Starting Durham Water scraper (headless={headless})...")
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
