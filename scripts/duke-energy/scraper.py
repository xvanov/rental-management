"""
Duke Energy utility bill scraper using Playwright.

Logs into the Duke Energy portal, switches accounts, and downloads bill PDFs.
"""
import os
import re
import sys
import traceback
from datetime import datetime
from pathlib import Path
from typing import Optional
import json
import time
import logging

from playwright.sync_api import sync_playwright, Page, Browser, TimeoutError as PlaywrightTimeout
from dotenv import load_dotenv

from models import AccountInfo, FetchResult, EnergyBillData
from parser import parse_pdf

logger = logging.getLogger(__name__)


class DukeEnergyScraper:
    """Scraper for Duke Energy utility portal."""

    BASE_URL = "https://www.duke-energy.com"
    LOGIN_URL = f"{BASE_URL}/sign-in"
    DASHBOARD_URL = f"{BASE_URL}/my-account/dashboard"

    def __init__(self, username: str, password: str, download_dir: str, debug_screenshots: bool = False):
        self.username = username
        self.password = password
        self.download_dir = Path(download_dir)
        self.download_dir.mkdir(parents=True, exist_ok=True)
        self.browser: Optional[Browser] = None
        self.page: Optional[Page] = None
        # Only save screenshots in debug mode (not in production)
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
        """Log into the Duke Energy portal."""
        print(f"Navigating to login page: {self.LOGIN_URL}")
        self.page.goto(self.LOGIN_URL, wait_until="networkidle")
        self.page.wait_for_timeout(2000)

        # Duke Energy uses a two-step login: email first, then password
        # Step 1: Find and fill email field
        email_selectors = [
            'input[type="email"]',
            'input[name="email"]',
            'input[id*="email" i]',
            'input[id*="user" i]',
            'input[name="username"]',
            'input[placeholder*="email" i]',
            'input[aria-label*="email" i]',
        ]

        email_field = None
        for selector in email_selectors:
            try:
                self.page.wait_for_selector(selector, timeout=5000)
                field = self.page.query_selector(selector)
                if field and field.is_visible():
                    email_field = field
                    print(f"Found email field with selector: {selector}")
                    break
            except Exception:
                continue

        if not email_field:
            print("Could not find email field")
            self._save_screenshot("login_error.png")
            return False

        # Fill email
        print("Filling email...")
        email_field.fill(self.username)
        self.page.wait_for_timeout(500)

        # Check if password field is already visible (single-page login)
        password_field = None
        password_selectors = [
            'input[type="password"]',
            'input[name="password"]',
            'input[id*="password" i]',
            'input[placeholder*="password" i]',
            'input[aria-label*="password" i]',
        ]

        for selector in password_selectors:
            try:
                field = self.page.query_selector(selector)
                if field and field.is_visible():
                    password_field = field
                    print(f"Found password field with selector: {selector}")
                    break
            except Exception:
                continue

        # If password field not visible, click continue/next button first
        if not password_field:
            print("Password field not visible, clicking Continue button...")

            # Duke Energy has a specific Continue button - target the visible one
            # The hidden submit button has aria-hidden="true", so we need to exclude it
            try:
                # Method 1: Press Enter key after filling email (most reliable)
                print("Pressing Enter to submit email...")
                email_field.press("Enter")
                print("Pressed Enter")
            except Exception as e:
                print(f"Error pressing Enter: {e}")
                # Method 2: Try clicking the visible Continue button via JavaScript
                try:
                    print("Trying JavaScript click on Continue button...")
                    self.page.evaluate('''() => {
                        const buttons = document.querySelectorAll('button');
                        for (const btn of buttons) {
                            if (btn.textContent.includes('Continue') &&
                                !btn.getAttribute('aria-hidden') &&
                                btn.offsetParent !== null) {
                                btn.click();
                                return true;
                            }
                        }
                        return false;
                    }''')
                except Exception as e2:
                    print(f"Error with JS click: {e2}")

            # Wait for page transition - password page should load
            print("Waiting for password page to load...")
            self.page.wait_for_timeout(3000)

            try:
                # Wait for either password field or URL change
                self.page.wait_for_load_state("networkidle", timeout=15000)
            except PlaywrightTimeout:
                print("Timeout waiting for networkidle, continuing...")

            self.page.wait_for_timeout(2000)
            self._save_screenshot("after_continue.png")

            # Log current URL to see if we navigated
            print(f"Current URL after continue: {self.page.url}")

            # Now look for password field again with retries
            for attempt in range(3):
                for selector in password_selectors:
                    try:
                        self.page.wait_for_selector(selector, timeout=5000)
                        field = self.page.query_selector(selector)
                        if field and field.is_visible():
                            password_field = field
                            print(f"Found password field after continue: {selector}")
                            break
                    except Exception:
                        continue
                if password_field:
                    break
                print(f"Password field not found, attempt {attempt + 1}/3...")
                self._save_screenshot(f"password_search_attempt_{attempt + 1}.png")
                self.page.wait_for_timeout(2000)

        if not password_field:
            print("Could not find password field")
            self._save_screenshot("login_error.png")
            return False

        # Fill password
        print("Filling password...")
        password_field.fill(self.password)
        self.page.wait_for_timeout(500)

        # Find and click login/submit button
        login_selectors = [
            'button[type="submit"]',
            'input[type="submit"]',
            'button:has-text("Sign In")',
            'button:has-text("Log In")',
            'button:has-text("Login")',
            'button:has-text("Submit")',
        ]

        for selector in login_selectors:
            try:
                button = self.page.query_selector(selector)
                if button and button.is_visible():
                    print(f"Clicking login button: {selector}")
                    button.click()
                    break
            except Exception:
                continue

        # Wait for navigation after login
        print("Waiting for login to complete...")
        try:
            self.page.wait_for_load_state("networkidle", timeout=30000)
        except PlaywrightTimeout:
            pass

        # Wait a bit for any redirects
        self.page.wait_for_timeout(5000)

        # Check if login was successful
        current_url = self.page.url
        page_content = self.page.content().lower()

        if "sign-in" in current_url.lower() and ("error" in page_content or "invalid" in page_content or "incorrect" in page_content):
            print("Login failed - invalid credentials")
            self._save_screenshot("login_failed.png")
            return False

        # Check if we're on the dashboard or account page
        if "dashboard" in current_url.lower() or "my-account" in current_url.lower() or "account" in current_url.lower():
            print(f"Login successful. Current URL: {current_url}")
            self._save_screenshot("after_login.png")
            return True

        print(f"Login appears successful. Current URL: {current_url}")
        self._save_screenshot("after_login.png")
        return True

    def _navigate_to_dashboard(self) -> bool:
        """Navigate to the account dashboard."""
        try:
            print(f"Navigating to dashboard: {self.DASHBOARD_URL}")
            self.page.goto(self.DASHBOARD_URL, wait_until="networkidle")
            self.page.wait_for_timeout(3000)
            self._save_screenshot("dashboard.png")
            return True
        except Exception as e:
            print(f"Error navigating to dashboard: {e}")
            return False

    def _open_account_sidebar(self) -> bool:
        """Open the Switch Accounts sidebar."""
        switch_selectors = [
            'button:has-text("Switch Accounts")',
            'a:has-text("Switch Accounts")',
            '[data-testid="switch-account"]',
            '.switch-account',
            'button:has-text("Switch Account")',
            '[aria-label*="switch account" i]',
        ]

        for selector in switch_selectors:
            try:
                btn = self.page.query_selector(selector)
                if btn and btn.is_visible():
                    print(f"Found switch account button with selector: {selector}")
                    btn.click()
                    self.page.wait_for_timeout(2000)
                    self._save_screenshot("account_switcher.png")
                    return True
            except Exception:
                continue

        print("Could not find Switch Accounts button")
        return False

    def _close_account_sidebar(self) -> bool:
        """Close the account sidebar if open. Returns True if closed successfully."""
        try:
            # Look for close button or click outside
            close_selectors = [
                'button[aria-label*="close" i]',
                '.sidebar-close',
                '.close-sidebar',
                'button:has-text("Close")',
            ]
            for selector in close_selectors:
                btn = self.page.query_selector(selector)
                if btn and btn.is_visible():
                    btn.click()
                    self.page.wait_for_timeout(500)
                    return True
            # Try pressing Escape
            self.page.keyboard.press('Escape')
            self.page.wait_for_timeout(500)
            return True
        except Exception as e:
            logger.warning(f"Error closing sidebar: {e}")
            return False

    def _switch_account(self, account_number: str) -> bool:
        """Switch to a specific account using the sidebar."""
        try:
            if not account_number:
                logger.error("Cannot switch account: account_number is None or empty")
                return False

            print(f"Switching to account: {account_number}")

            # Open the sidebar if not already open
            if not self._open_account_sidebar():
                return False

            self.page.wait_for_timeout(1500)

            # Duke Energy uses label elements for account selection (radio button style)
            # Account numbers are displayed with # prefix like #910176500588
            # Use Playwright's locator API for more reliable element finding
            label_locator = self.page.locator(f'label:has-text("{account_number}")')

            if label_locator.count() > 0:
                print(f"Found account label, clicking...")
                label_locator.first.click()
                self.page.wait_for_timeout(1000)
            else:
                # Fallback: try other selector patterns
                account_formatted = f"{account_number[:4]} {account_number[4:8]} {account_number[8:]}" if len(account_number) == 12 else account_number

                account_selectors = [
                    f'label:has-text("#{account_number}")',
                    f'[data-account="{account_number}"]',
                    f'div:has-text("{account_formatted}")',
                ]

                account_elem = None
                for selector in account_selectors:
                    try:
                        locator = self.page.locator(selector)
                        if locator.count() > 0:
                            account_elem = locator.first
                            print(f"Found account with selector: {selector}")
                            break
                    except Exception as e:
                        logger.debug(f"Selector {selector} failed: {e}")
                        continue

                if not account_elem:
                    print(f"Could not find account {account_number} in sidebar")
                    self._save_screenshot("account_not_found.png")
                    self._close_account_sidebar()
                    return False

                account_elem.click()
                self.page.wait_for_timeout(1000)

            self._save_screenshot("after_account_click.png")

            # Click "Select This Account" button
            select_btn_locator = self.page.locator('button:has-text("Select This Account"), button:has-text("Select Account")')

            if select_btn_locator.count() > 0:
                print("Clicking Select Account button...")
                select_btn_locator.first.click()
                self.page.wait_for_timeout(2000)
            else:
                logger.warning("Could not find Select Account button")

            # Wait for page to load new account
            try:
                self.page.wait_for_load_state("networkidle", timeout=15000)
            except PlaywrightTimeout:
                pass

            self.page.wait_for_timeout(3000)
            self._save_screenshot("after_switch.png")

            print(f"Successfully switched to account: {account_number}")
            return True

        except Exception as e:
            logger.error(f"Error switching account: {e}")
            traceback.print_exc()
            return False

    def _get_accounts(self) -> list[AccountInfo]:
        """Get list of accounts from the portal by opening the Switch Accounts sidebar."""
        accounts = []

        try:
            self.page.wait_for_load_state("networkidle")

            # Open the Switch Accounts sidebar to see all accounts
            if not self._open_account_sidebar():
                # Fallback: try to find account numbers from page content
                print("Could not open sidebar, trying to find accounts from page content...")
                return self._get_accounts_from_page_content()

            self.page.wait_for_timeout(2000)
            self._save_screenshot("sidebar_open_for_accounts.png")

            # Find the sidebar container
            sidebar_selectors = [
                'aside',
                '[class*="sidebar"]',
                '[class*="drawer"]',
                '[class*="panel"]',
                '[class*="switch-account"]',
                '[role="dialog"]',
                '[role="complementary"]',
            ]

            sidebar = None
            for selector in sidebar_selectors:
                try:
                    elem = self.page.query_selector(selector)
                    if elem and elem.is_visible():
                        text = elem.inner_text()
                        # Check if this contains account-like content
                        if re.search(r'\d{4}\s?\d{4}\s?\d{4}', text) or 'account' in text.lower():
                            sidebar = elem
                            print(f"Found sidebar with selector: {selector}")
                            break
                except Exception as e:
                    logger.debug(f"Sidebar selector {selector} failed: {e}")
                    continue

            if sidebar:
                sidebar_text = sidebar.inner_text()
                print(f"Sidebar content preview: {sidebar_text[:200]}...")

                # Parse accounts from sidebar
                # Duke Energy shows accounts with format:
                # Account Number (formatted with spaces): 9101 7650 0588
                # Address: 3606 Appling Way, Durham, NC 27703

                # Find all account blocks - look for account numbers and nearby addresses
                lines = sidebar_text.split('\n')
                current_account = None

                for i, line in enumerate(lines):
                    line = line.strip()

                    # Look for account number (12 digits, possibly with spaces)
                    account_match = re.search(r'(\d{4}\s?\d{4}\s?\d{4})', line)
                    if account_match:
                        account_num = re.sub(r'\s+', '', account_match.group(1))
                        current_account = account_num

                        # Look for address in nearby lines
                        address = ""
                        for j in range(i, min(i + 5, len(lines))):
                            next_line = lines[j].strip()
                            # Address pattern: starts with number, contains street type
                            if re.match(r'^\d+\s+[A-Za-z]', next_line):
                                address = next_line
                                break

                        # Check if we already have this account
                        if not any(a.account_number == account_num for a in accounts):
                            accounts.append(AccountInfo(
                                account_number=account_num,
                                service_address=address,
                                current_balance=0.0,
                            ))
                            print(f"Found account: {account_num} - {address}")

            # Close the sidebar
            self._close_account_sidebar()

            # If we found no accounts from sidebar, fallback to page content
            if not accounts:
                print("No accounts found in sidebar, trying page content...")
                accounts = self._get_accounts_from_page_content()

            print(f"Total accounts found: {len(accounts)}")

        except Exception as e:
            logger.error(f"Error getting accounts: {e}")
            traceback.print_exc()

        return accounts

    def _get_accounts_from_page_content(self) -> list[AccountInfo]:
        """Fallback: Extract account numbers from visible page text."""
        accounts = []

        try:
            # Use inner_text to get visible text only, not raw HTML
            page_text = self.page.inner_text('body')

            # Pattern for 12-digit account numbers (with or without spaces)
            account_matches = re.findall(r'(\d{4}\s?\d{4}\s?\d{4})', page_text)

            seen = set()
            for match in account_matches:
                account_num = re.sub(r'\s+', '', match)
                if account_num not in seen and len(account_num) == 12:
                    seen.add(account_num)
                    accounts.append(AccountInfo(
                        account_number=account_num,
                        service_address="",  # Will be filled from PDF
                        current_balance=0.0,
                    ))
                    print(f"Found account from page: {account_num}")
        except Exception as e:
            logger.error(f"Error extracting accounts from page: {e}")

        return accounts

    def _download_bill_via_api(self, account_number: str = None) -> Optional[str]:
        """Download bill PDF by intercepting the invoice API response."""
        try:
            print("Downloading bill via API interception...")
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            account_str = account_number or "unknown"
            filename = f"duke_energy_{account_str}_{timestamp}.pdf"
            save_path = self.download_dir / filename

            invoice_data = None

            def capture_invoice(response):
                nonlocal invoice_data
                if 'billing/invoice' in response.url:
                    try:
                        invoice_data = response.json()
                    except Exception:
                        pass

            # Set up response capture
            self.page.on('response', capture_invoice)

            # Click View Bill to trigger the API call
            view_btn = self.page.locator('button:has-text("View Bill")')
            if view_btn.count() > 0:
                view_btn.first.click()
                self.page.wait_for_timeout(5000)

            # Remove the listener
            self.page.remove_listener('response', capture_invoice)

            # Close any popup that opened
            if len(self.page.context.pages) > 1:
                for pg in self.page.context.pages[1:]:
                    try:
                        pg.close()
                    except Exception:
                        pass

            if invoice_data and invoice_data.get('status') == 'Success':
                # Extract the hex-encoded PDF
                reply_code = invoice_data.get('invoiceImage', {}).get('MessageReply', {}).get('replyCode', '')
                if reply_code:
                    try:
                        # Decode hex to bytes
                        pdf_bytes = bytes.fromhex(reply_code)
                        # Verify it's a PDF
                        if pdf_bytes[:4] == b'%PDF':
                            with open(save_path, 'wb') as f:
                                f.write(pdf_bytes)
                            print(f"Downloaded PDF via API: {save_path}")
                            return str(save_path)
                        else:
                            print(f"Decoded data is not a PDF (starts with {pdf_bytes[:10]})")
                    except Exception as e:
                        print(f"Error decoding PDF hex: {e}")
            else:
                print(f"Invoice API did not return success: {invoice_data}")

            return None

        except Exception as e:
            print(f"Error downloading bill via API: {e}")
            traceback.print_exc()
            return None

    def _download_bill_pdf(self, account_number: str = None) -> Optional[str]:
        """Download the bill PDF for the current account."""
        # First try the API interception method (more reliable)
        result = self._download_bill_via_api(account_number)
        if result:
            return result

        # Fallback to the popup method
        print("API method failed, trying popup method...")
        try:
            print("Looking for View Bill button...")
            self._save_screenshot("before_view_bill.png")

            # Look for "View Bill" button
            view_bill_selectors = [
                'button:has-text("View Bill")',
                'a:has-text("View Bill")',
                '[data-testid="view-bill"]',
                '.view-bill',
                'button:has-text("View Statement")',
                'a:has-text("View Statement")',
                'button:has-text("Download")',
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

            # Try to download the PDF
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            account_str = account_number or "unknown"
            filename = f"duke_energy_{account_str}_{timestamp}.pdf"
            save_path = self.download_dir / filename

            # Store current page count before clicking
            initial_pages = len(self.page.context.pages)
            current_url = self.page.url

            # Click the button
            print("Clicking View Bill...")
            view_btn.click()
            self.page.wait_for_timeout(3000)
            self._save_screenshot("after_view_bill_click.png")

            # Check what happened after clicking
            new_url = self.page.url
            new_pages = len(self.page.context.pages)
            print(f"After click - URL: {new_url}, Pages: {new_pages}")

            # Case 1: New tab/window opened
            if new_pages > initial_pages:
                print("New tab opened, checking for PDF...")
                new_page = self.page.context.pages[-1]

                # Wait for the new tab to actually load - it may start as about:blank
                # and then navigate to the PDF URL via JavaScript
                pdf_url = new_page.url
                print(f"Initial new tab URL: {pdf_url}")

                # Poll for URL change if it starts as about:blank
                if pdf_url == 'about:blank':
                    print("Waiting for PDF to load in new tab...")
                    for _ in range(20):  # Wait up to 10 seconds
                        new_page.wait_for_timeout(500)
                        pdf_url = new_page.url
                        if pdf_url != 'about:blank':
                            print(f"New tab URL changed to: {pdf_url}")
                            break
                    else:
                        # Still about:blank - try waiting for load state
                        try:
                            new_page.wait_for_load_state("load", timeout=10000)
                            pdf_url = new_page.url
                            print(f"After load state, URL: {pdf_url}")
                        except PlaywrightTimeout:
                            print("Timeout waiting for new tab to load")

                # Try waiting for network idle
                if pdf_url == 'about:blank':
                    try:
                        new_page.wait_for_load_state("networkidle", timeout=15000)
                        pdf_url = new_page.url
                        print(f"After networkidle, URL: {pdf_url}")
                    except PlaywrightTimeout:
                        pass

                # Duke Energy shows "Please wait..." while loading PDF
                # Wait for loading text to disappear and PDF to appear
                if pdf_url == 'about:blank':
                    print("Waiting for PDF viewer to load (may show 'Please wait...')...")
                    for attempt in range(30):  # Wait up to 30 seconds
                        new_page.wait_for_timeout(1000)
                        page_content = new_page.content()

                        # Check if still loading
                        if 'please wait' in page_content.lower():
                            if attempt % 5 == 0:
                                print(f"  Still loading... ({attempt}s)")
                            continue

                        # Check if URL changed to blob
                        pdf_url = new_page.url
                        if pdf_url.startswith('blob:'):
                            print(f"PDF loaded as blob URL: {pdf_url[:50]}...")
                            break

                        # Check for embedded PDF or iframe with PDF
                        if '<embed' in page_content or '<iframe' in page_content or '<object' in page_content:
                            print("Found embedded content in page")
                            break

                        # Check for PDF.js or similar viewer
                        if 'pdf' in page_content.lower() and 'viewer' in page_content.lower():
                            print("Found PDF viewer")
                            break

                    pdf_url = new_page.url
                    print(f"Final URL after waiting: {pdf_url}")

                # Take screenshot from the new page
                if self.debug_screenshots:
                    new_page.screenshot(path=str(self.download_dir / "new_tab.png"))

                # Case 1a: Blob URL - PDF loaded in browser viewer
                if pdf_url.startswith('blob:'):
                    print("Detected blob URL, extracting PDF data...")
                    try:
                        # Wait for PDF to fully load
                        new_page.wait_for_timeout(3000)

                        # Extract blob data using JavaScript
                        pdf_data = new_page.evaluate('''async (url) => {
                            try {
                                const response = await fetch(url);
                                const blob = await response.blob();
                                return new Promise((resolve, reject) => {
                                    const reader = new FileReader();
                                    reader.onloadend = () => {
                                        // Remove the data URL prefix
                                        const base64 = reader.result.split(',')[1];
                                        resolve(base64);
                                    };
                                    reader.onerror = reject;
                                    reader.readAsDataURL(blob);
                                });
                            } catch (e) {
                                return null;
                            }
                        }''', pdf_url)

                        if pdf_data:
                            import base64
                            pdf_bytes = base64.b64decode(pdf_data)
                            with open(save_path, 'wb') as f:
                                f.write(pdf_bytes)
                            print(f"Downloaded PDF from blob: {save_path}")
                            new_page.close()
                            return str(save_path)
                        else:
                            print("Could not extract blob data")
                    except Exception as e:
                        print(f"Error extracting blob: {e}")

                # Case 1b: Direct PDF URL
                elif '.pdf' in pdf_url.lower():
                    import requests
                    cookies = {c['name']: c['value'] for c in self.page.context.cookies()}
                    response = requests.get(pdf_url, cookies=cookies, timeout=30)
                    if response.status_code == 200:
                        with open(save_path, 'wb') as f:
                            f.write(response.content)
                        print(f"Downloaded PDF from new tab: {save_path}")
                        new_page.close()
                        return str(save_path)

                # Case 1c: Check for download link in new tab
                download_selectors = [
                    'a[href*=".pdf"]',
                    'a:has-text("Download")',
                    'button:has-text("Download")',
                    'a[download]',
                ]
                for sel in download_selectors:
                    try:
                        link = new_page.query_selector(sel)
                        if link and link.is_visible():
                            href = link.get_attribute('href')
                            if href:
                                if not href.startswith('http'):
                                    href = f"{self.BASE_URL}{href}"
                                import requests
                                cookies = {c['name']: c['value'] for c in self.page.context.cookies()}
                                response = requests.get(href, cookies=cookies, timeout=30)
                                if response.status_code == 200 and len(response.content) > 1000:
                                    with open(save_path, 'wb') as f:
                                        f.write(response.content)
                                    print(f"Downloaded PDF from link: {save_path}")
                                    new_page.close()
                                    return str(save_path)
                    except Exception:
                        continue

                # Case 1d: Try expecting download from new page
                try:
                    with new_page.expect_download(timeout=15000) as download_info:
                        # Look for any download trigger
                        dl_btn = new_page.query_selector('a:has-text("Download"), button:has-text("Download")')
                        if dl_btn and dl_btn.is_visible():
                            dl_btn.click()
                    download = download_info.value
                    download.save_as(str(save_path))
                    print(f"Downloaded PDF via button: {save_path}")
                    new_page.close()
                    return str(save_path)
                except Exception as e:
                    print(f"No download from new tab: {e}")

                new_page.close()

            # Case 2: Navigated to billing page
            if new_url != current_url and 'bill' in new_url.lower():
                print("Navigated to billing page, looking for PDF download...")
                self._save_screenshot("billing_page.png")

                # Look for PDF link or download button
                download_selectors = [
                    'a[href*=".pdf"]',
                    'a:has-text("Download PDF")',
                    'button:has-text("Download PDF")',
                    'a:has-text("Download")',
                    'button:has-text("Download")',
                    '[data-testid*="download"]',
                ]
                for sel in download_selectors:
                    try:
                        link = self.page.query_selector(sel)
                        if link and link.is_visible():
                            href = link.get_attribute('href')
                            if href and '.pdf' in href.lower():
                                if not href.startswith('http'):
                                    href = f"{self.BASE_URL}{href}"
                                import requests
                                cookies = {c['name']: c['value'] for c in self.page.context.cookies()}
                                response = requests.get(href, cookies=cookies, timeout=30)
                                if response.status_code == 200:
                                    with open(save_path, 'wb') as f:
                                        f.write(response.content)
                                    print(f"Downloaded PDF from billing page: {save_path}")
                                    return str(save_path)

                            # Try clicking for download
                            try:
                                with self.page.expect_download(timeout=15000) as download_info:
                                    link.click()
                                download = download_info.value
                                download.save_as(str(save_path))
                                print(f"Downloaded PDF via click: {save_path}")
                                return str(save_path)
                            except PlaywrightTimeout:
                                pass
                    except Exception:
                        continue

            # Case 3: Check for PDF iframe or embed on current page
            try:
                pdf_frame = self.page.query_selector('iframe[src*=".pdf"], embed[src*=".pdf"], object[data*=".pdf"]')
                if pdf_frame:
                    pdf_url = pdf_frame.get_attribute('src') or pdf_frame.get_attribute('data')
                    if pdf_url:
                        if not pdf_url.startswith('http'):
                            pdf_url = f"{self.BASE_URL}{pdf_url}"
                        import requests
                        cookies = {c['name']: c['value'] for c in self.page.context.cookies()}
                        response = requests.get(pdf_url, cookies=cookies, timeout=30)
                        if response.status_code == 200:
                            with open(save_path, 'wb') as f:
                                f.write(response.content)
                            print(f"Downloaded PDF from iframe: {save_path}")
                            return str(save_path)
            except Exception as e:
                print(f"Error checking iframe: {e}")

            print("Could not download PDF - saving page for analysis")
            self._save_screenshot("download_failed.png")
            return None

        except Exception as e:
            print(f"Error downloading bill: {e}")
            import traceback
            traceback.print_exc()
            return None

    def fetch_bills(self, headless: bool = True, account_filter: str = None) -> FetchResult:
        """
        Main method to fetch all bills from the portal.

        Args:
            headless: Run browser in headless mode
            account_filter: If specified, only fetch this specific account (otherwise fetch ALL)

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

                # Navigate to dashboard
                if not self._navigate_to_dashboard():
                    result.errors.append("Could not navigate to dashboard")
                    return result

                # Get all accounts from the portal
                accounts = self._get_accounts()
                result.accounts = accounts

                if not accounts:
                    result.errors.append("No accounts found in portal")
                    return result

                print(f"\n{'='*60}")
                print(f"Found {len(accounts)} account(s) to process")
                print('='*60)

                # Determine which accounts to process
                accounts_to_process = accounts
                if account_filter:
                    accounts_to_process = [a for a in accounts if a.account_number == account_filter]
                    if not accounts_to_process:
                        result.errors.append(f"Account {account_filter} not found in portal")
                        return result

                # Download bill for the first/current account (before switching)
                first_account = accounts_to_process[0]
                print(f"\n--- Processing account 1/{len(accounts_to_process)}: {first_account.account_number} ---")

                pdf_path = self._download_bill_pdf(first_account.account_number)
                if pdf_path:
                    result.downloaded_pdfs.append(pdf_path)
                    try:
                        bill_data = parse_pdf(pdf_path)
                        result.bills.append(bill_data)
                        print(f"Successfully parsed bill for {first_account.account_number}")
                    except Exception as e:
                        result.errors.append(f"Error parsing PDF {pdf_path}: {e}")
                else:
                    result.errors.append(f"Could not download bill for {first_account.account_number}")

                # Process remaining accounts by switching to each one
                for i, account in enumerate(accounts_to_process[1:], start=2):
                    print(f"\n--- Processing account {i}/{len(accounts_to_process)}: {account.account_number} ---")

                    # Switch to this account
                    if not self._switch_account(account.account_number):
                        result.errors.append(f"Could not switch to account {account.account_number}")
                        continue

                    # Navigate back to dashboard for this account
                    if not self._navigate_to_dashboard():
                        result.errors.append(f"Could not navigate to dashboard for {account.account_number}")
                        continue

                    # Download bill for this account
                    pdf_path = self._download_bill_pdf(account.account_number)
                    if pdf_path:
                        result.downloaded_pdfs.append(pdf_path)
                        try:
                            bill_data = parse_pdf(pdf_path)
                            result.bills.append(bill_data)
                            print(f"Successfully parsed bill for {account.account_number}")
                        except Exception as e:
                            result.errors.append(f"Error parsing PDF {pdf_path}: {e}")
                    else:
                        result.errors.append(f"Could not download bill for {account.account_number}")

                result.success = len(result.bills) > 0

                print(f"\n{'='*60}")
                print(f"COMPLETED: {len(result.bills)} bills downloaded, {len(result.errors)} errors")
                print('='*60)

            except Exception as e:
                result.errors.append(f"Scraper error: {str(e)}")
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
        env_local = Path(__file__).parent.parent.parent / ".env.local"
        if env_local.exists():
            load_dotenv(env_local)

    username = os.getenv("DUKE_ELECTRIC_USER")
    password = os.getenv("DUKE_ELECTRIC_PASS")

    if not username or not password:
        print("Error: DUKE_ELECTRIC_USER and DUKE_ELECTRIC_PASS must be set in .env file")
        sys.exit(1)

    download_dir = Path(__file__).parent.parent.parent / "data" / "downloaded-bills" / "duke-energy"

    scraper = DukeEnergyScraper(
        username=username,
        password=password,
        download_dir=str(download_dir),
    )

    # Default to headless=True, use --visible to show browser
    headless = "--visible" not in sys.argv
    account = None
    for i, arg in enumerate(sys.argv):
        if arg == "--account" and i + 1 < len(sys.argv):
            account = sys.argv[i + 1]

    print(f"Starting Duke Energy scraper (headless={headless})...")
    result = scraper.fetch_bills(headless=headless, account_filter=account)

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
