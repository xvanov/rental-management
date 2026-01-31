#!/bin/bash
# Setup script for Enbridge Gas scraper

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Setting up Enbridge Gas scraper..."

# Create virtual environment if it doesn't exist
if [ ! -d "$SCRIPT_DIR/.venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv "$SCRIPT_DIR/.venv"
fi

# Activate and install dependencies
echo "Installing dependencies..."
source "$SCRIPT_DIR/.venv/bin/activate"
pip install --upgrade pip
pip install -r "$SCRIPT_DIR/requirements.txt"

# Install Playwright browsers
echo "Installing Playwright browsers..."
playwright install chromium

echo "Setup complete!"
echo ""
echo "Required environment variables (add to .env.local):"
echo "  ENBRIDGE_GAS_USER=<your_username>"
echo "  ENBRIDGE_GAS_PASS=<your_password>"
echo ""
echo "For MFA via email (optional):"
echo "  ENBRIDGE_MFA_EMAIL=<email_address>"
echo "  ENBRIDGE_MFA_EMAIL_PASS=<email_password>"
echo "  ENBRIDGE_MFA_IMAP_SERVER=imap.gmail.com"
