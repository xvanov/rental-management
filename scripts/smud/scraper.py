"""
SMUD (Sacramento Municipal Utility District) scraper using Playwright.

Logs into the SMUD portal and downloads bills for active accounts.
Portal URL: https://myaccount.smud.org
"""
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional
import json

from playwright.sync_api import sync_playwright, Page, Browser, TimeoutError as PlaywrightTimeout
from dotenv import load_dotenv
import requests

from models import AccountInfo, FetchResult, SmudBillData
from parser import parse_pdf

# Add parent directory to path for lib imports
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))
from lib.bill_storage import save_bill_pdf


class SmudScraper:
    """Scraper for SMUD utility portal."""

    BASE_URL = "https://myaccount.smud.org"
    LOGIN_URL = f"{BASE_URL}/?ack=true"

    def __init__(self, username: str, password: str, download_dir: str, target_addresses: list[str] = None):
        """
        Initialize the scraper.

        Args:
            username: SMUD account email/username
            password: Account password
            download_dir: Directory to save downloaded PDFs
            target_addresses: Optional list of addresses to target (partial match)
        """
        self.username = username
        self.password = password
        self.download_dir = Path(download_dir)
        self.download_dir.mkdir(parents=True, exist_ok=True)
        self.target_addresses = [addr.upper() for addr in (target_addresses or [])]
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
        """Log into the SMUD portal."""
        print(f"Navigating to login page: {self.LOGIN_URL}")
        self.page.goto(self.LOGIN_URL, wait_until="networkidle")

        # Wait for page to load
        self.page.wait_for_timeout(2000)
        self.page.screenshot(path=str(self.download_dir / "login_page.png"))

        try:
            # Look for email/username field
            username_selectors = [
                'input[type="email"]',
                'input[name="email"]',
                'input[name="username"]',
                'input[name="login"]',
                'input[id*="email" i]',
                'input[id*="username" i]',
                'input[placeholder*="email" i]',
                'input[type="text"]',
            ]

            username_field = None
            for selector in username_selectors:
                try:
                    field = self.page.query_selector(selector)
                    if field and field.is_visible():
                        username_field = field
                        print(f"Found username field: {selector}")
                        break
                except Exception:
                    continue

            if not username_field:
                print("Could not find username field")
                self.page.screenshot(path=str(self.download_dir / "login_error.png"))
                return False

            # Look for password field
            password_selectors = [
                'input[type="password"]',
                'input[name="password"]',
                'input[id*="password" i]',
            ]

            password_field = None
            for selector in password_selectors:
                try:
                    field = self.page.query_selector(selector)
                    if field and field.is_visible():
                        password_field = field
                        print(f"Found password field: {selector}")
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
            self.page.wait_for_timeout(300)
            password_field.fill(self.password)
            self.page.wait_for_timeout(300)

            # Find and click sign in button
            signin_selectors = [
                'button:has-text("Sign In")',
                'button:has-text("Sign in")',
                'button:has-text("Login")',
                'button:has-text("Log In")',
                'input[type="submit"]',
                'button[type="submit"]',
                'a:has-text("Sign In")',
            ]

            signin_btn = None
            for selector in signin_selectors:
                try:
                    btn = self.page.query_selector(selector)
                    if btn and btn.is_visible():
                        signin_btn = btn
                        print(f"Found sign in button: {selector}")
                        break
                except Exception:
                    continue

            if signin_btn:
                print("Clicking Sign In...")
                signin_btn.click()
            else:
                # Try pressing Enter
                print("No sign in button found, pressing Enter...")
                password_field.press('Enter')

            # Wait for navigation
            try:
                self.page.wait_for_load_state("networkidle", timeout=30000)
            except PlaywrightTimeout:
                pass

            self.page.wait_for_timeout(3000)
            self.page.screenshot(path=str(self.download_dir / "after_login.png"))

            # Check if login was successful
            current_url = self.page.url
            page_content = self.page.content().lower()

            if "invalid" in page_content or "incorrect" in page_content or "error" in page_content:
                if "password" in page_content or "credentials" in page_content:
                    print("Login failed - invalid credentials")
                    return False

            # Look for indicators of successful login (accounts list, dashboard, etc.)
            if "account" in page_content or "address" in page_content or "due" in page_content:
                print(f"Login successful! Current URL: {current_url}")
                return True

            print(f"Login status unclear, proceeding... URL: {current_url}")
            return True

        except Exception as e:
            print(f"Login error: {e}")
            import traceback
            traceback.print_exc()
            self.page.screenshot(path=str(self.download_dir / "login_error.png"))
            return False

    def _get_accounts(self) -> list[AccountInfo]:
        """Get list of accounts from the portal using DOM selectors."""
        accounts = []
        cutoff_date = datetime.now() - timedelta(days=60)

        try:
            self.page.wait_for_load_state("networkidle")
            self.page.wait_for_timeout(2000)
            self.page.screenshot(path=str(self.download_dir / "accounts_page.png"))

            # SMUD portal uses a list/card layout for accounts
            # Look for clickable rows that contain account info
            row_selectors = [
                # Specific SMUD selectors based on observed page structure
                '[class*="account"] [class*="row"]',
                '[class*="Account"] [class*="Row"]',
                'div[role="row"]',
                'div[class*="clickable"]',
                'a[href*="account"]',
                # Generic row patterns - look for divs with arrows (chevrons)
                'div:has(svg)',
                'div:has([class*="arrow"])',
                'div:has([class*="chevron"])',
            ]

            rows = []
            for selector in row_selectors:
                try:
                    rows = self.page.query_selector_all(selector)
                    # Filter to rows that have both an address pattern and 7-digit number
                    valid_rows = []
                    for row in rows:
                        text = row.inner_text()
                        if self._extract_account_number_from_text(text) and self._has_address_pattern(text):
                            valid_rows.append(row)
                    if valid_rows:
                        print(f"Found {len(valid_rows)} account rows with selector: {selector}")
                        rows = valid_rows
                        break
                except Exception:
                    continue

            # If no rows found with selectors, try scanning the page content
            if not rows:
                print("No rows found with selectors, scanning page content...")
                page_text = self.page.inner_text('body')
                accounts = self._parse_accounts_from_text(page_text, cutoff_date)
                if accounts:
                    print(f"Found {len(accounts)} accounts from page text")
                    return accounts

            for row in rows:
                try:
                    row_text = row.inner_text()

                    # Extract account number (look for 7-digit number)
                    account_num = self._extract_account_number_from_text(row_text)
                    if not account_num:
                        continue

                    # Extract address
                    address = self._extract_address_from_text(row_text)

                    # Extract due date
                    due_date = self._extract_date_from_text(row_text)
                    is_active = False
                    if due_date:
                        is_active = datetime.combine(due_date, datetime.min.time()) > cutoff_date

                    # Extract amount
                    balance = self._extract_amount_from_text(row_text)

                    # Check target addresses
                    should_include = True
                    if self.target_addresses:
                        should_include = any(
                            target in address.upper()
                            for target in self.target_addresses
                        )

                    if (is_active or should_include) and account_num not in [a.account_number for a in accounts]:
                        accounts.append(AccountInfo(
                            account_number=account_num,
                            service_address=address,
                            current_balance=balance,
                            due_date=due_date,
                            is_active=is_active,
                        ))
                        print(f"  Found account: {account_num} - {address} (active={is_active})")

                except Exception as e:
                    print(f"  Error parsing row: {e}")
                    continue

        except Exception as e:
            print(f"Error getting accounts: {e}")
            import traceback
            traceback.print_exc()

        # If target addresses specified, filter to only those
        if self.target_addresses:
            accounts = [
                a for a in accounts
                if any(target in a.service_address for target in self.target_addresses)
            ]
            print(f"Filtered to {len(accounts)} target accounts")

        return accounts

    def _has_address_pattern(self, text: str) -> bool:
        """Check if text contains what looks like a street address."""
        street_suffixes = [
            ' ST', ' AVE', ' DR', ' CT', ' RD', ' LN', ' WAY', ' BLVD', ' CIR',
            ' STREET', ' AVENUE', ' DRIVE', ' COURT', ' ROAD', ' LANE', ' CIRCLE',
            ' PL', ' PLACE', ' TER', ' TERRACE', ' PKWY', ' PARKWAY',
        ]
        text_upper = text.upper()
        for suffix in street_suffixes:
            if suffix in text_upper:
                return True
        return False

    def _parse_accounts_from_text(self, text: str, cutoff_date: datetime) -> list[AccountInfo]:
        """Parse accounts from raw page text by looking for patterns."""
        accounts = []
        lines = text.split('\n')

        # Look through lines for patterns like:
        # "3448 BERETANIA WAY" followed by "7037161" followed by date and amount
        i = 0
        while i < len(lines):
            line = lines[i].strip()

            # Check if this line looks like an address
            if line and line[0].isdigit() and self._has_address_pattern(line):
                address = line.upper()

                # Look at following lines for account number, date, amount
                account_num = None
                due_date = None
                balance = 0.0

                # Check next few lines
                for j in range(i + 1, min(i + 5, len(lines))):
                    next_line = lines[j].strip()

                    # Try to extract account number
                    if not account_num:
                        num = self._extract_account_number_from_text(next_line)
                        if num:
                            account_num = num
                            continue

                    # Try to extract date
                    if not due_date:
                        date = self._extract_date_from_text(next_line)
                        if date:
                            due_date = date
                            continue

                    # Try to extract amount
                    if '$' in next_line:
                        balance = self._extract_amount_from_text(next_line)

                if account_num:
                    is_active = False
                    if due_date:
                        is_active = datetime.combine(due_date, datetime.min.time()) > cutoff_date

                    should_include = True
                    if self.target_addresses:
                        should_include = any(
                            target in address
                            for target in self.target_addresses
                        )

                    if (is_active or should_include) and account_num not in [a.account_number for a in accounts]:
                        accounts.append(AccountInfo(
                            account_number=account_num,
                            service_address=address,
                            current_balance=balance,
                            due_date=due_date,
                            is_active=is_active,
                        ))

            i += 1

        return accounts

    def _extract_account_number_from_text(self, text: str) -> Optional[str]:
        """Extract 7-digit account number from text without regex."""
        # Look for sequences of exactly 7 digits
        current_digits = ""
        for char in text:
            if char.isdigit():
                current_digits += char
                if len(current_digits) == 7:
                    return current_digits
            else:
                if len(current_digits) == 7:
                    return current_digits
                current_digits = ""
        if len(current_digits) == 7:
            return current_digits
        return None

    def _extract_address_from_text(self, text: str) -> str:
        """Extract street address from text without regex."""
        lines = text.replace('\t', '\n').split('\n')

        street_indicators = [
            ' ST', ' AVE', ' DR', ' CT', ' RD', ' LN', ' WAY', ' BLVD', ' CIR',
            ' STREET', ' AVENUE', ' DRIVE', ' COURT', ' ROAD', ' LANE', ' CIRCLE',
            ' PL', ' PLACE', ' TER', ' TERRACE', ' PKWY', ' PARKWAY', ' HWY',
        ]

        for line in lines:
            line = line.strip().upper()
            # Check if line starts with a number (street address typically does)
            if line and line[0].isdigit():
                for indicator in street_indicators:
                    if indicator in line:
                        # Find where the street suffix ends
                        idx = line.find(indicator) + len(indicator)
                        # Return up to that point, cleaning up extra spaces
                        address = ' '.join(line[:idx].split())
                        if len(address) > 5:  # Sanity check
                            return address

        return "UNKNOWN"

    def _extract_date_from_text(self, text: str) -> Optional[datetime.date]:
        """Extract date in MM/DD/YYYY format from text without regex."""
        # Look for pattern like "1/15/2026" or "01/15/2026"
        i = 0
        while i < len(text):
            # Look for a digit that could start a date
            if text[i].isdigit():
                # Try to parse date starting here
                date_str = ""
                j = i
                slash_count = 0
                while j < len(text) and (text[j].isdigit() or text[j] == '/'):
                    if text[j] == '/':
                        slash_count += 1
                    date_str += text[j]
                    j += 1
                    if slash_count == 2 and len(date_str) >= 8:
                        # We have something like "1/15/2026" or "01/15/2026"
                        try:
                            parts = date_str.split('/')
                            if len(parts) == 3:
                                month = int(parts[0])
                                day = int(parts[1])
                                year = int(parts[2])
                                if 1 <= month <= 12 and 1 <= day <= 31 and 2000 <= year <= 2100:
                                    return datetime(year, month, day).date()
                        except (ValueError, IndexError):
                            pass
                        break
                i = j
            else:
                i += 1
        return None

    def _extract_amount_from_text(self, text: str) -> float:
        """Extract dollar amount from text without regex."""
        # Look for $ followed by digits
        i = 0
        while i < len(text):
            if text[i] == '$':
                # Extract the number after $
                amount_str = ""
                j = i + 1
                while j < len(text) and (text[j].isdigit() or text[j] in ',.'):
                    amount_str += text[j]
                    j += 1
                if amount_str:
                    try:
                        return float(amount_str.replace(',', ''))
                    except ValueError:
                        pass
            i += 1
        return 0.0

    def _click_account(self, account: AccountInfo) -> bool:
        """Click on an account row to view its details."""
        try:
            print(f"Looking for account {account.account_number} ({account.service_address})...")

            # Use Playwright's locator API which handles scrolling automatically
            # Look for the row containing the account number and click on it
            account_locator = self.page.locator(f'text="{account.account_number}"').first

            if account_locator.count() == 0:
                print(f"Could not find account {account.account_number} on page")
                return False

            # Scroll into view and click
            print("Found account, scrolling into view and clicking...")
            account_locator.scroll_into_view_if_needed()
            self.page.wait_for_timeout(500)

            # Click with force to bypass any overlay issues
            account_locator.click(force=True)

            # Wait for navigation
            self.page.wait_for_timeout(2000)

            try:
                self.page.wait_for_load_state("networkidle", timeout=10000)
            except Exception:
                pass

            current_url = self.page.url
            print(f"Current URL after click: {current_url}")
            self.page.screenshot(path=str(self.download_dir / f"account_{account.account_number}.png"))

            # Check if we navigated away from account selection
            if 'accountselection' not in current_url.lower():
                return True

            # If still on selection page, try clicking the chevron/arrow icon in the row
            print("Still on selection page, trying to click the row's arrow...")
            try:
                # Find all rows, locate the one with this account number
                rows = self.page.locator('[class*="row"]').all()
                for row in rows:
                    row_text = row.inner_text()
                    if account.account_number in row_text:
                        # Look for SVG (arrow icon) in this row
                        arrow = row.locator('svg').first
                        if arrow.count() > 0:
                            arrow.scroll_into_view_if_needed()
                            arrow.click(force=True)
                            self.page.wait_for_timeout(2000)
                            try:
                                self.page.wait_for_load_state("networkidle", timeout=10000)
                            except Exception:
                                pass

                            current_url = self.page.url
                            print(f"URL after arrow click: {current_url}")
                            if 'accountselection' not in current_url.lower():
                                return True
                        break
            except Exception as e:
                print(f"Arrow click failed: {e}")

            # Try clicking on the entire row element
            print("Trying to click the entire row element...")
            try:
                # Find rows that contain this account
                row_locator = self.page.locator(f'div:has-text("{account.account_number}")').first
                row_locator.scroll_into_view_if_needed()
                # Use JavaScript click as fallback
                row_locator.evaluate('el => el.click()')
                self.page.wait_for_timeout(2000)
                try:
                    self.page.wait_for_load_state("networkidle", timeout=10000)
                except Exception:
                    pass

                current_url = self.page.url
                print(f"URL after JS click: {current_url}")
                if 'accountselection' not in current_url.lower():
                    return True
            except Exception as e:
                print(f"JS click failed: {e}")

            print(f"Could not navigate to account {account.account_number}")
            return False

        except Exception as e:
            print(f"Error clicking account: {e}")
            import traceback
            traceback.print_exc()
            return False

    def _download_bill(self, account: AccountInfo) -> Optional[str]:
        """Download the current bill for the account."""
        try:
            # Use shorter timeout and don't require networkidle
            self.page.wait_for_timeout(2000)
            self.page.screenshot(path=str(self.download_dir / f"bill_page_{account.account_number}.png"))

            # Look for "VIEW BILL" link on SMUD dashboard
            # The link text may be uppercase or mixed case
            view_bill_locator = self.page.locator('text="VIEW BILL"').or_(
                self.page.locator('text="View Bill"')
            ).or_(
                self.page.locator('a:has-text("View Bill")')
            ).or_(
                self.page.locator('[class*="view"][class*="bill"]')
            )

            if view_bill_locator.count() == 0:
                # Try looking in the billing section
                billing_section = self.page.locator('[class*="billing"]').or_(
                    self.page.locator('text="Billing"')
                )
                if billing_section.count() > 0:
                    view_bill_locator = billing_section.locator('a').filter(has_text="Bill")

            if view_bill_locator.count() == 0:
                print("Could not find 'View Bill' link")
                self.page.screenshot(path=str(self.download_dir / f"no_view_bill_{account.account_number}.png"))
                return None

            print("Found 'View Bill' link, clicking...")
            # Expect a new page/tab to open with the PDF
            try:
                with self.page.context.expect_page(timeout=15000) as new_page_info:
                    view_bill_locator.first.click()

                new_page = new_page_info.value
                self.page.wait_for_timeout(2000)

                try:
                    new_page.wait_for_load_state("domcontentloaded", timeout=10000)
                except Exception:
                    pass

                pdf_url = new_page.url
                print(f"New page opened: {pdf_url}")

                return self._download_pdf_from_page(new_page, account)

            except PlaywrightTimeout:
                print("No new page opened, checking for download...")

            # Check if a download started
            try:
                with self.page.expect_download(timeout=10000) as download_info:
                    view_bill_locator.first.click()
                download = download_info.value
                return self._save_download(download, account)
            except Exception:
                pass

            # Maybe the PDF is shown in an iframe or embed on the same page
            self.page.wait_for_timeout(2000)
            self.page.screenshot(path=str(self.download_dir / f"after_view_bill_{account.account_number}.png"))

            # Look for PDF in embed/iframe
            pdf_frame = self.page.locator('iframe[src*="pdf"], embed[type*="pdf"], object[type*="pdf"]')
            if pdf_frame.count() > 0:
                src = pdf_frame.first.get_attribute('src') or pdf_frame.first.get_attribute('data')
                if src:
                    print(f"Found embedded PDF: {src}")
                    return self._download_pdf_from_url(src, account)

            # Check for download link
            download_link = self.page.locator('a[download], a:has-text("Download")').first
            if download_link.count() > 0:
                try:
                    with self.page.expect_download(timeout=15000) as download_info:
                        download_link.click()
                    download = download_info.value
                    return self._save_download(download, account)
                except Exception:
                    pass

            print("Could not download bill")
            return None

        except Exception as e:
            print(f"Error downloading bill: {e}")
            import traceback
            traceback.print_exc()
            return None

    def _download_pdf_from_page(self, pdf_page: Page, account: AccountInfo) -> Optional[str]:
        """Download PDF from a page that's displaying it."""
        try:
            pdf_url = pdf_page.url
            print(f"PDF page URL: {pdf_url}")

            # If URL ends with .pdf or contains pdf, try to get it
            if pdf_url.endswith('.pdf') or 'pdf' in pdf_url.lower():
                return self._download_pdf_from_url(pdf_url, account)

            # Look for download button in PDF viewer
            download_selectors = [
                'button[title*="download" i]',
                'button[title*="Download" i]',
                'a[download]',
                '#download',
                '.download',
            ]

            for selector in download_selectors:
                try:
                    btn = pdf_page.query_selector(selector)
                    if btn and btn.is_visible():
                        with pdf_page.expect_download(timeout=15000) as download_info:
                            btn.click()
                        download = download_info.value
                        return self._save_download(download, account)
                except Exception:
                    continue

            # Try to find embedded PDF URL by looking for links/embeds with .pdf
            pdf_url = self._find_pdf_url_in_page(pdf_page)
            if pdf_url:
                return self._download_pdf_from_url(pdf_url, account)

            # Check for blob URL or data URL
            embed = pdf_page.query_selector('embed[type*="pdf"], object[type*="pdf"], iframe[src*="pdf"]')
            if embed:
                src = embed.get_attribute('src') or embed.get_attribute('data')
                if src:
                    return self._download_pdf_from_url(src, account)

            pdf_page.close()
            return None

        except Exception as e:
            print(f"Error downloading from PDF page: {e}")
            return None

    def _find_pdf_url_in_page(self, page: Page) -> Optional[str]:
        """Find PDF URL in page content without regex."""
        # Look for links that end with .pdf
        links = page.query_selector_all('a[href*=".pdf"], a[href*="pdf"]')
        for link in links:
            href = link.get_attribute('href')
            if href and '.pdf' in href.lower():
                return href

        # Look for iframes/embeds with PDF sources
        for selector in ['iframe[src]', 'embed[src]', 'object[data]']:
            elements = page.query_selector_all(selector)
            for elem in elements:
                src = elem.get_attribute('src') or elem.get_attribute('data')
                if src and '.pdf' in src.lower():
                    return src

        # Search the page content for URLs ending in .pdf
        content = page.content()
        # Find http/https URLs that contain .pdf
        url_start = 0
        while True:
            # Look for http:// or https://
            http_idx = content.find('http://', url_start)
            https_idx = content.find('https://', url_start)

            if http_idx == -1 and https_idx == -1:
                break

            # Take the first one found
            if http_idx == -1:
                start_idx = https_idx
            elif https_idx == -1:
                start_idx = http_idx
            else:
                start_idx = min(http_idx, https_idx)

            # Extract URL until whitespace or quote
            end_idx = start_idx
            while end_idx < len(content) and content[end_idx] not in ' \t\n\r"\'<>':
                end_idx += 1

            url = content[start_idx:end_idx]
            if '.pdf' in url.lower():
                return url

            url_start = end_idx

        return None

    def _download_pdf_from_url(self, url: str, account: AccountInfo) -> Optional[str]:
        """Download PDF directly from URL."""
        try:
            print(f"Downloading PDF from: {url[:100]}...")

            # Get cookies for authenticated download
            cookies = {c['name']: c['value'] for c in self.page.context.cookies()}

            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            }

            response = requests.get(url, cookies=cookies, headers=headers, timeout=30)

            if response.status_code == 200:
                content = response.content
                if content[:4] == b'%PDF' or len(content) > 1000:
                    # Save to standardized location
                    billing_date = account.due_date if account.due_date else datetime.now().date()
                    # Convert date to datetime for the function
                    billing_datetime = datetime.combine(billing_date, datetime.min.time())
                    save_path = save_bill_pdf(
                        address=account.service_address,
                        provider="SMUD",
                        billing_date=billing_datetime,
                        pdf_content=content
                    )
                    return save_path

            print(f"Failed to download PDF: status={response.status_code}")
            return None

        except Exception as e:
            print(f"Error downloading PDF from URL: {e}")
            return None

    def _save_download(self, download, account: AccountInfo) -> Optional[str]:
        """Save a Playwright download."""
        try:
            # First save to temp location
            temp_path = self.download_dir / f"temp_{account.account_number}.pdf"
            download.save_as(str(temp_path))

            # Read content and save to standardized location
            with open(temp_path, 'rb') as f:
                content = f.read()

            billing_date = account.due_date if account.due_date else datetime.now().date()
            billing_datetime = datetime.combine(billing_date, datetime.min.time())
            save_path = save_bill_pdf(
                address=account.service_address,
                provider="SMUD",
                billing_date=billing_datetime,
                pdf_content=content
            )

            # Remove temp file
            temp_path.unlink(missing_ok=True)

            return save_path
        except Exception as e:
            print(f"Error saving download: {e}")
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

                # Get accounts (filtered to active ones)
                accounts = self._get_accounts()
                result.accounts = accounts
                print(f"\nFound {len(accounts)} accounts to process")

                if not accounts:
                    result.errors.append("No active accounts found")
                    result.success = True  # Not an error, just no accounts
                    return result

                # Process each account
                for account in accounts:
                    print(f"\n{'='*50}")
                    print(f"Processing account: {account.account_number} - {account.service_address}")
                    print(f"{'='*50}")

                    # Click on the account
                    if not self._click_account(account):
                        result.errors.append(f"Could not access account {account.account_number}")
                        continue

                    # Download the bill
                    pdf_path = self._download_bill(account)

                    if pdf_path:
                        result.downloaded_pdfs.append(pdf_path)

                        # Parse the PDF
                        try:
                            bill_data = parse_pdf(pdf_path)
                            # Always use known account info - PDF extraction can be unreliable
                            bill_data.account_number = account.account_number
                            bill_data.service_address = account.service_address
                            result.bills.append(bill_data)
                        except Exception as e:
                            result.errors.append(f"Error parsing PDF for {account.account_number}: {e}")
                    else:
                        result.errors.append(f"Could not download bill for {account.account_number}")

                    # Go back to accounts list for next account
                    try:
                        # Navigate directly to account selection page
                        self.page.goto(f"{self.BASE_URL}/signin/accountselection", timeout=15000)
                        self.page.wait_for_timeout(2000)
                    except Exception:
                        # Fallback: use browser back
                        try:
                            self.page.go_back()
                            self.page.wait_for_timeout(2000)
                        except Exception:
                            pass

                result.success = len(result.bills) > 0 or len(accounts) == 0

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

    username = os.getenv("SMUD_WATER_USER")
    password = os.getenv("SMUD_WATER_PASS")
    target_addresses = os.getenv("SMUD_ADDRESSES", "").split(",") if os.getenv("SMUD_ADDRESSES") else None
    target_addresses = [a.strip() for a in target_addresses if a.strip()] if target_addresses else None

    if not username or not password:
        print("Error: SMUD_USER and SMUD_PASS must be set in .env file")
        sys.exit(1)

    # Download directory
    download_dir = Path(__file__).parent.parent.parent / "data" / "smud-bills"

    # Create scraper and fetch bills
    scraper = SmudScraper(
        username=username,
        password=password,
        download_dir=str(download_dir),
        target_addresses=target_addresses,
    )

    # Run with visible browser for debugging
    headless = "--visible" not in sys.argv and "-v" not in sys.argv

    print(f"Starting SMUD scraper (headless={headless})...")
    if target_addresses:
        print(f"Target addresses: {target_addresses}")
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
            if bill.kwh_used:
                print(f"Usage: {bill.kwh_used} kWh")
            if bill.requires_attention:
                print(f"*** ATTENTION REQUIRED: {bill.attention_reason} ***")

    # Save results to JSON
    output_path = download_dir / f"fetch_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    download_dir.mkdir(parents=True, exist_ok=True)
    with open(output_path, 'w') as f:
        json.dump({
            "success": result.success,
            "timestamp": datetime.now().isoformat(),
            "accounts": [
                {
                    "account_number": a.account_number,
                    "service_address": a.service_address,
                    "balance": a.current_balance,
                    "due_date": a.due_date.isoformat() if a.due_date else None,
                    "is_active": a.is_active,
                } for a in result.accounts
            ],
            "bills": [b.to_dict() for b in result.bills],
            "errors": result.errors,
            "downloaded_pdfs": result.downloaded_pdfs,
        }, f, indent=2)
    print(f"\nResults saved to: {output_path}")


if __name__ == "__main__":
    main()
