import os, re, time
from dotenv import load_dotenv
load_dotenv('../../.env')
load_dotenv('../../.env.production')
load_dotenv('../../.env.local', override=True)

from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto('https://myaccount.smud.org/?ack=true', wait_until='domcontentloaded')
    time.sleep(3)

    # Login with correct selectors
    page.fill('#UserId', os.getenv('SMUD_WATER_USER', ''))
    page.fill('#Password', os.getenv('SMUD_WATER_PASS', ''))
    page.click('button[type="submit"]')

    # Wait with domcontentloaded, NOT networkidle
    try:
        page.wait_for_load_state('domcontentloaded', timeout=15000)
    except:
        pass
    time.sleep(8)

    print(f'URL after login: {page.url}')

    # Check if still on login page
    if 'ack=true' in page.url or 'Sign in' in page.inner_text('body')[:500]:
        print('LOGIN FAILED - still on login page')
        print('Page text:', page.inner_text('body')[:500])
        browser.close()
        exit()

    print('LOGIN SUCCEEDED')

    text = page.inner_text('body')[:5000]
    print('\n=== PAGE TEXT (first 5000 chars) ===')
    print(text)

    # Find account numbers
    accts = re.findall(r'\b\d{7,10}\b', text)
    print(f'\nPossible account numbers: {accts[:10]}')

    amounts = re.findall(r'\$[\d,]+\.\d{2}', text)
    print(f'Dollar amounts: {amounts[:10]}')

    # Find all clickable links
    links = page.query_selector_all('a, button')
    print(f'\nClickable elements: {len(links)}')
    for el in links:
        txt = el.inner_text().strip()[:80]
        href = el.get_attribute('href') or ''
        if txt and el.is_visible():
            tag = el.evaluate('e => e.tagName')
            print(f'  [{tag}] "{txt}" -> {href}')

    browser.close()
