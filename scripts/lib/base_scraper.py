"""
Base scraper class for all utility portal scrapers.

Provides shared browser setup, login helpers, PDF download,
and the fetch_bills() template method. Subclass and override
_login(), _get_accounts(), _download_bills() for each provider.
"""
import json
import os
import re
import sys
import time
import logging
import requests
from abc import ABC, abstractmethod
from datetime import datetime
from pathlib import Path
from typing import Optional, Callable

from playwright.sync_api import (
    sync_playwright,
    Page,
    Browser,
    BrowserContext,
    Playwright,
    TimeoutError as PlaywrightTimeout,
)

from lib.bill_storage import save_bill_pdf, get_project_root
from lib.models import AccountInfo, FetchResult, BillDataBase

logger = logging.getLogger(__name__)


class BaseScraper(ABC):
    """
    Base class for utility bill scrapers.

    Subclasses MUST implement:
      - PROVIDER_NAME (str): Display name, e.g. "Duke Energy"
      - LOGIN_URL (str): Portal login page
      - _login() -> bool
      - _download_bills() -> list[BillDataBase]

    Subclasses MAY override:
      - _setup_browser(): for stealth/Firefox
      - _get_accounts(): if portal has multi-account
      - _after_login(): post-login navigation
    """

    PROVIDER_NAME: str = ""
    LOGIN_URL: str = ""

    def __init__(
        self,
        download_dir: str,
        debug_screenshots: bool = False,
        **credentials,
    ):
        self.download_dir = Path(download_dir)
        self.download_dir.mkdir(parents=True, exist_ok=True)
        self.debug_screenshots = debug_screenshots or os.getenv("DEBUG_SCREENSHOTS", "").lower() == "true"
        self.credentials = credentials
        self.browser: Optional[Browser] = None
        self.context: Optional[BrowserContext] = None
        self.page: Optional[Page] = None

    # ─── Browser Setup ──────────────────────────────────────────────

    def _setup_browser(self, playwright: Playwright, headless: bool = True):
        """Launch Chromium with standard settings. Override for stealth/Firefox."""
        self.browser = playwright.chromium.launch(headless=headless)
        self.context = self.browser.new_context(
            accept_downloads=True,
            viewport={"width": 1920, "height": 1080},
        )
        self.page = self.context.new_page()

    def _setup_stealth_browser(self, playwright: Playwright, headless: bool = True):
        """Launch Chromium with anti-detection measures. Call from subclass _setup_browser."""
        self.browser = playwright.chromium.launch(
            headless=headless,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-setuid-sandbox",
            ],
        )
        self.context = self.browser.new_context(
            accept_downloads=True,
            viewport={"width": 1920, "height": 1080},
            user_agent=(
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            ),
            locale="en-US",
            timezone_id="America/Los_Angeles",
        )
        self.page = self.context.new_page()
        # Remove webdriver flag
        self.page.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        """)

    # ─── Shared Helpers ─────────────────────────────────────────────

    def _find_field(self, selectors: list[str]):
        """Find the first visible element matching any selector in the list."""
        for selector in selectors:
            try:
                el = self.page.query_selector(selector)
                if el and el.is_visible():
                    return el
            except Exception:
                continue
        return None

    def _fill_field(self, selectors: list[str], value: str) -> bool:
        """Find a field and fill it. Returns True if successful."""
        field = self._find_field(selectors)
        if field:
            field.fill(value)
            return True
        return False

    def _click_button(self, selectors: list[str]) -> bool:
        """Find a button and click it. Returns True if successful."""
        btn = self._find_field(selectors)
        if btn:
            btn.click()
            return True
        return False

    def _wait_for_navigation(self, timeout: int = 15000):
        """Wait for page navigation. Catches timeout — never fatal."""
        try:
            self.page.wait_for_load_state("networkidle", timeout=timeout)
        except PlaywrightTimeout:
            pass
        except Exception:
            pass

    def _wait_for_idle(self, seconds: float = 2.0):
        """Simple wait for dynamic content to settle."""
        time.sleep(seconds)

    def _save_screenshot(self, name: str):
        """Save debug screenshot if enabled."""
        if self.debug_screenshots and self.page:
            try:
                path = str(self.download_dir / name)
                self.page.screenshot(path=path)
            except Exception:
                pass

    def _get_page_text(self) -> str:
        """Get visible text content of the current page."""
        try:
            return self.page.inner_text("body")
        except Exception:
            return ""

    # ─── PDF Download Helpers ───────────────────────────────────────

    def _download_pdf_from_url(self, url: str, filename: str) -> Optional[str]:
        """Download a PDF from URL using requests with browser cookies."""
        try:
            cookies = self.context.cookies()
            session = requests.Session()
            for cookie in cookies:
                session.cookies.set(cookie["name"], cookie["value"], domain=cookie.get("domain", ""))

            resp = session.get(url, timeout=30)
            if resp.status_code == 200 and (resp.content[:4] == b"%PDF" or len(resp.content) > 1000):
                filepath = str(self.download_dir / filename)
                with open(filepath, "wb") as f:
                    f.write(resp.content)
                return filepath
        except Exception as e:
            print(f"  PDF download failed: {e}")
        return None

    def _expect_download(self, action: Callable, filename: str, timeout: int = 30000) -> Optional[str]:
        """Execute an action that triggers a download and save the file."""
        try:
            with self.page.expect_download(timeout=timeout) as download_info:
                action()
            download = download_info.value
            filepath = str(self.download_dir / filename)
            download.save_as(filepath)
            return filepath
        except Exception as e:
            print(f"  Download failed: {e}")
            return None

    def _copy_to_standard_location(
        self, pdf_path: str, service_address: str, billing_date: datetime = None
    ) -> str:
        """Copy PDF to the standardized bill storage location."""
        try:
            if not service_address:
                return pdf_path
            if not billing_date:
                billing_date = datetime.now()

            with open(pdf_path, "rb") as f:
                pdf_content = f.read()

            standard_path = save_bill_pdf(
                address=service_address,
                provider=self.PROVIDER_NAME,
                billing_date=billing_date,
                pdf_content=pdf_content,
            )
            print(f"  Copied to standard location: {standard_path}")
            return standard_path
        except Exception as e:
            print(f"  Warning: Could not copy to standard location: {e}")
            return pdf_path

    # ─── Abstract Methods (subclass must implement) ─────────────────

    @abstractmethod
    def _login(self) -> bool:
        """Log into the utility portal. Return True on success."""
        ...

    @abstractmethod
    def _download_bills(self) -> list:
        """Download and parse bills. Return list of BillDataBase subclass instances."""
        ...

    def _get_accounts(self) -> list[AccountInfo]:
        """Get account list. Override for multi-account portals. Default: single implicit account."""
        return []

    def _after_login(self):
        """Hook for post-login navigation (e.g. dismiss popups). Override if needed."""
        pass

    # ─── Main Entry Point ───────────────────────────────────────────

    def fetch_bills(self, headless: bool = True) -> FetchResult:
        """
        Template method: setup → login → download → cleanup.
        Subclasses implement _login() and _download_bills().
        """
        result = FetchResult()

        with sync_playwright() as playwright:
            try:
                self._setup_browser(playwright, headless)
                print(f"Fetching bills from {self.PROVIDER_NAME} portal...")

                # Login
                print(f"Navigating to login page: {self.LOGIN_URL}")
                self.page.goto(self.LOGIN_URL, wait_until="domcontentloaded")
                self._wait_for_idle(3)

                if not self._login():
                    result.errors.append("Login failed")
                    self._save_screenshot("login_failed.png")
                    return result

                print(f"Login successful! Current URL: {self.page.url}")
                self._after_login()

                # Get accounts (optional)
                accounts = self._get_accounts()
                result.accounts = accounts

                # Download and parse bills
                bills = self._download_bills()
                result.bills = bills
                result.success = len(bills) > 0 or len(result.errors) == 0

                print(f"\n{'='*60}")
                print(f"COMPLETED: {len(bills)} bills downloaded, {len(result.errors)} errors")
                print(f"{'='*60}")

            except Exception as e:
                print(f"Error: {e}")
                result.errors.append(str(e))
                self._save_screenshot("error.png")

            finally:
                if self.browser:
                    self.browser.close()

        return result

    # ─── Shared main() ──────────────────────────────────────────────

    @staticmethod
    def run_main(
        scraper_class: type,
        credential_keys: dict[str, str],
        default_download_subdir: str = "",
    ):
        """
        Standard main() for all scrapers.

        Args:
            scraper_class: The scraper class to instantiate
            credential_keys: Map of constructor kwarg name -> env var name
                e.g. {"username": "DUKE_ELECTRIC_USER", "password": "DUKE_ELECTRIC_PASS"}
            default_download_subdir: Subdirectory under data/downloaded-bills/
        """
        import argparse

        parser = argparse.ArgumentParser(
            description=f"{scraper_class.PROVIDER_NAME} Utility Bill Fetcher"
        )
        parser.add_argument("--visible", "-v", action="store_true", help="Run browser visibly")
        parser.add_argument("--parse-only", "-p", action="store_true", help="Parse existing PDFs only")
        parser.add_argument("--test", "-t", action="store_true", help="Test parser with samples")
        parser.add_argument("--json", "-j", action="store_true", help="Output as JSON")
        parser.add_argument("--output", "-o", type=str, help="Save JSON to file")
        parser.add_argument("--account", type=str, help="Specific account to fetch")
        args = parser.parse_args()

        # Load environment
        from dotenv import load_dotenv
        root = get_project_root()
        for env_file in [".env", ".env.local"]:
            env_path = root / env_file
            if env_path.exists():
                load_dotenv(env_path, override=True)

        # Resolve credentials
        creds = {}
        for kwarg_name, env_name in credential_keys.items():
            val = os.getenv(env_name)
            if not val:
                # Try alternate names
                alt_name = env_name.replace("_USER", "_PASS") if "_PASS" not in env_name else None
                if not val:
                    print(f"Error: {env_name} must be set in .env")
                    sys.exit(1)
            creds[kwarg_name] = val

        download_dir = root / "data" / "downloaded-bills" / (default_download_subdir or scraper_class.PROVIDER_NAME.lower().replace(" ", "-"))

        scraper = scraper_class(download_dir=str(download_dir), **creds)

        if args.parse_only:
            # Parse existing PDFs — delegate to subclass or use default
            from parser import parse_pdf
            bills = []
            pdf_dir = download_dir
            if pdf_dir.exists():
                for pdf_path in sorted(pdf_dir.glob("*.pdf")):
                    try:
                        print(f"\nParsing: {pdf_path.name}")
                        bill = parse_pdf(str(pdf_path))
                        bills.append(bill)
                        print(f"  Account: {bill.account_number}")
                        print(f"  Address: {bill.service_address}")
                        print(f"  Amount: ${bill.amount_due:.2f}")
                    except Exception as e:
                        print(f"  Error: {e}")

            if args.json or args.output:
                _output_json(bills, Path(args.output) if args.output else None)
            return

        # Fetch from portal
        result = scraper.fetch_bills(headless=not args.visible)

        if args.json or args.output:
            _output_json(result.bills, Path(args.output) if args.output else None)


def _output_json(bills: list, output_path: Path = None):
    """Output bills as JSON."""
    data = {
        "timestamp": datetime.now().isoformat(),
        "count": len(bills),
        "bills": [b.to_dict() if hasattr(b, "to_dict") else b for b in bills],
        "requires_attention": [
            b.to_dict() if hasattr(b, "to_dict") else b
            for b in bills
            if getattr(b, "requires_attention", False)
        ],
    }

    if output_path:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w") as f:
            json.dump(data, f, indent=2, default=str)
        print(f"\nResults saved to: {output_path}")
    else:
        print(json.dumps(data, indent=2, default=str))
