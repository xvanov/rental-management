#!/bin/bash
# Setup script for Spectrum scraper

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Setting up Spectrum scraper..."

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
echo "  SPECTRUM_USER=<your_username>"
echo "  SPECTRUM_PASS=<your_password>"
echo ""
echo "For MFA via email (optional but recommended):"
echo "  GMAIL_USER=<email_address>"
echo "  GMAIL_PASS=<gmail_app_password>"
echo ""
