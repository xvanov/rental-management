"""
MFA helper for retrieving verification codes from email.

Supports IMAP-based email retrieval for MFA codes sent by Spectrum.

Environment variables:
  GMAIL_USER - Gmail email address
  GMAIL_PASS - Gmail app password (not regular password if 2FA is enabled)
               To create an app password:
               1. Go to Google Account > Security > 2-Step Verification
               2. At the bottom, click "App passwords"
               3. Generate a new app password for "Mail"
"""
import os
import re
import time
import email
from datetime import datetime, timedelta
from typing import Optional
import imaplib
from html.parser import HTMLParser


class HTMLTextExtractor(HTMLParser):
    """Extract text content from HTML, stripping all tags."""

    def __init__(self):
        super().__init__()
        self.text_parts = []
        self._skip_data = False

    def handle_starttag(self, tag, attrs):
        # Skip script and style content
        if tag in ('script', 'style', 'head'):
            self._skip_data = True

    def handle_endtag(self, tag):
        if tag in ('script', 'style', 'head'):
            self._skip_data = False
        # Add space after block elements
        if tag in ('p', 'div', 'br', 'tr', 'td', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'):
            self.text_parts.append(' ')

    def handle_data(self, data):
        if not self._skip_data:
            self.text_parts.append(data)

    def get_text(self):
        return ' '.join(self.text_parts)


def html_to_text(html: str) -> str:
    """Convert HTML to plain text."""
    try:
        parser = HTMLTextExtractor()
        parser.feed(html)
        text = parser.get_text()
        # Clean up whitespace
        text = re.sub(r'\s+', ' ', text)
        return text.strip()
    except Exception:
        # Fallback: simple regex strip
        text = re.sub(r'<[^>]+>', ' ', html)
        text = re.sub(r'\s+', ' ', text)
        return text.strip()


def get_mfa_code_from_gmail(
    timeout_seconds: int = 120,
    poll_interval: int = 5
) -> Optional[str]:
    """
    Poll Gmail inbox for an MFA code from Spectrum.

    Uses GMAIL_USER and GMAIL_PASS environment variables.

    Args:
        timeout_seconds: How long to wait for the code
        poll_interval: Seconds between checks

    Returns:
        The MFA code if found, None otherwise
    """
    email_address = os.getenv('GMAIL_USER')
    email_password = os.getenv('GMAIL_PASS')

    if not email_address or not email_password:
        print("Warning: GMAIL_USER and GMAIL_PASS not set. Cannot retrieve MFA codes automatically.")
        return None

    imap_server = "imap.gmail.com"
    start_time = datetime.now()

    # IMPORTANT: Only look at emails received AFTER we started waiting
    # This prevents using old MFA codes from previous attempts
    # We add a small buffer (10 seconds before) to account for email delivery time
    cutoff_time = start_time - timedelta(seconds=10)

    print(f"Waiting for MFA code email at {email_address} (timeout: {timeout_seconds}s)...")
    print(f"Will only accept emails received after: {cutoff_time.strftime('%H:%M:%S')}")

    # Wait a few seconds for the email to arrive before first check
    print("Waiting 5s for email to arrive...")
    time.sleep(5)

    while (datetime.now() - start_time).total_seconds() < timeout_seconds:
        try:
            # Use standard imaplib (more reliable)
            mail = imaplib.IMAP4_SSL(imap_server)
            mail.login(email_address, email_password)
            mail.select('INBOX')

            # Search for recent emails - IMAP date format
            date_str = cutoff_time.strftime('%d-%b-%Y')

            # Search for emails from Spectrum
            # Spectrum sends from: myaccount@spectrumemails.com
            search_queries = [
                f'(FROM "spectrumemails.com" SINCE {date_str})',
                f'(FROM "spectrum" SINCE {date_str})',
                f'(FROM "charter" SINCE {date_str})',
                f'(SUBJECT "Verification Code" SINCE {date_str})',
            ]

            for query in search_queries:
                try:
                    status, messages = mail.search(None, query)
                    if status == 'OK' and messages[0]:
                        message_ids = messages[0].split()

                        # Check most recent messages first
                        for msg_id in reversed(message_ids):
                            try:
                                status, msg_data = mail.fetch(msg_id, '(RFC822)')
                                if status != 'OK':
                                    continue

                                raw_email = msg_data[0][1]
                                msg = email.message_from_bytes(raw_email)

                                # Get email body - try plain text first, then HTML
                                body = ""
                                html_body = ""
                                if msg.is_multipart():
                                    for part in msg.walk():
                                        content_type = part.get_content_type()
                                        if content_type == "text/plain" and not body:
                                            try:
                                                body = part.get_payload(decode=True).decode('utf-8', errors='ignore')
                                            except:
                                                pass
                                        elif content_type == "text/html" and not html_body:
                                            try:
                                                html_body = part.get_payload(decode=True).decode('utf-8', errors='ignore')
                                            except:
                                                pass
                                else:
                                    try:
                                        content = msg.get_payload(decode=True).decode('utf-8', errors='ignore')
                                        content_type = msg.get_content_type()
                                        if content_type == "text/html":
                                            html_body = content
                                        else:
                                            body = content
                                    except:
                                        pass

                                # If no plain text, convert HTML to text
                                if not body and html_body:
                                    body = html_to_text(html_body)
                                    print(f"  Converted HTML email to text ({len(body)} chars)")

                                # Also check subject
                                subject = str(msg.get('Subject', ''))
                                from_addr = str(msg.get('From', '')).lower()

                                # Check email date - only accept emails after cutoff
                                email_date_str = msg.get('Date', '')
                                try:
                                    from email.utils import parsedate_to_datetime
                                    email_date = parsedate_to_datetime(email_date_str)
                                    # Make cutoff_time timezone-aware if email_date is
                                    if email_date.tzinfo is not None:
                                        from datetime import timezone
                                        cutoff_aware = cutoff_time.replace(tzinfo=timezone.utc)
                                        if email_date < cutoff_aware:
                                            print(f"  Skipping old email from {email_date.strftime('%H:%M:%S')} (before cutoff)")
                                            continue
                                    else:
                                        if email_date.replace(tzinfo=None) < cutoff_time:
                                            print(f"  Skipping old email from {email_date.strftime('%H:%M:%S')} (before cutoff)")
                                            continue
                                except Exception as date_err:
                                    # If we can't parse date, continue checking the email
                                    pass

                                # Debug
                                print(f"  Checking email from: {from_addr}, subject: {subject[:50]}")

                                # Look for verification code patterns
                                search_text = f"{subject} {body}"

                                # Debug: print part of body
                                print(f"  Email body preview: {body[:200].replace(chr(10), ' ')}")

                                code_patterns = [
                                    # Spectrum format: "Your verification code is: 123456" or similar
                                    r'verification code[:\s]+is[:\s]*(\d{6})',
                                    r'your code[:\s]+is[:\s]*(\d{6})',
                                    r'(?:code|pin|verification)[:\s]+(\d{6})',
                                    r'(\d{6})\s+is your',
                                    r'enter[:\s]+(\d{6})',
                                    # More patterns for Spectrum's HTML emails
                                    r'code[:\s]*(\d{6})',
                                    r'(\d{6})[.\s]+(?:this|enter|use)',
                                    # Standalone 6-digit code (last resort - must be from Spectrum)
                                    r'\b(\d{6})\b',
                                ]

                                # Skip codes that are obviously wrong
                                invalid_codes = {'000000', '123456', '111111', '999999'}

                                # Check if this is definitely from Spectrum
                                is_spectrum_email = 'spectrum' in from_addr or 'charter' in from_addr

                                for pattern in code_patterns:
                                    # Only use standalone digit pattern for confirmed Spectrum emails
                                    if pattern == r'\b(\d{6})\b' and not is_spectrum_email:
                                        continue

                                    match = re.search(pattern, search_text, re.IGNORECASE)
                                    if match:
                                        code = match.group(1)
                                        if code not in invalid_codes:
                                            print(f"Found MFA code: {code}")

                                        # Mark as read
                                        mail.store(msg_id, '+FLAGS', '\\Seen')
                                        mail.close()
                                        mail.logout()
                                        return code

                            except Exception as e:
                                print(f"Error reading message: {e}")
                                continue

                except Exception as e:
                    print(f"Search error: {e}")
                    continue

            mail.close()
            mail.logout()

        except imaplib.IMAP4.error as e:
            print(f"IMAP error: {e}")
            print("Note: If using Gmail with 2FA, you need an App Password, not your regular password.")
            print("Generate one at: Google Account > Security > 2-Step Verification > App passwords")
            return None
        except Exception as e:
            print(f"Error checking email: {e}")

        print(f"No MFA code found yet, waiting {poll_interval}s...")
        time.sleep(poll_interval)

    print("Timeout waiting for MFA code")
    return None


def is_interactive() -> bool:
    """Check if running in an interactive terminal."""
    import sys
    return sys.stdin.isatty()


def prompt_for_mfa_code() -> Optional[str]:
    """Prompt user to manually enter MFA code.

    Returns None if not running in interactive mode.
    """
    if not is_interactive():
        print("[ERROR] MFA code required but running in non-interactive mode.")
        print("Cannot prompt for manual input. Automatic email retrieval must work.")
        print("\nTo fix this:")
        print("1. Ensure GMAIL_USER and GMAIL_PASS are set in .env.local")
        print("2. GMAIL_PASS must be a 16-character App Password (no spaces)")
        print("3. Generate at: https://myaccount.google.com/apppasswords")
        return None

    print("\n" + "="*50)
    print("MFA CODE REQUIRED")
    print("="*50)
    print("Please check your email/phone for the verification code")
    print("from Spectrum and enter it below.")
    print("="*50)
    code = input("Enter MFA code: ").strip()
    return code


def get_mfa_code(auto_email: bool = True) -> Optional[str]:
    """
    Get MFA code either automatically from email or via manual input.

    Args:
        auto_email: If True, try to get code from Gmail first

    Returns:
        The MFA code, or None if retrieval failed
    """
    if auto_email:
        gmail_user = os.getenv('GMAIL_USER')
        gmail_pass = os.getenv('GMAIL_PASS')

        if gmail_user and gmail_pass:
            code = get_mfa_code_from_gmail()
            if code:
                return code
            print("Automatic email retrieval failed, falling back to manual input")
        else:
            print("Gmail credentials not configured (GMAIL_USER/GMAIL_PASS)")
            if not is_interactive():
                print("[ERROR] Cannot retrieve MFA code - Gmail not configured and not interactive")
                return None
            print("Using manual input...")

    return prompt_for_mfa_code()


if __name__ == "__main__":
    # Test the MFA retrieval
    import sys
    from pathlib import Path
    from dotenv import load_dotenv

    # Load env
    project_root = Path(__file__).parent.parent.parent
    env_local = project_root / ".env.local"
    if env_local.exists():
        load_dotenv(env_local)

    print("Testing MFA code retrieval from Gmail...")
    code = get_mfa_code_from_gmail(timeout_seconds=30, poll_interval=3)
    if code:
        print(f"Retrieved code: {code}")
    else:
        print("No code found (this is expected if no MFA email was sent)")
