#!/bin/bash
# Setup script for Wake Electric scraper

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Setting up Wake Electric scraper..."

# Create virtual environment if it doesn't exist
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv .venv
fi

# Activate virtual environment
source .venv/bin/activate

# Install dependencies
echo "Installing Python dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

# Install Playwright browsers
echo "Installing Playwright browsers..."
playwright install chromium

echo ""
echo "Setup complete!"
echo ""
echo "To use the scraper, make sure you have these environment variables set:"
echo "  WAKE_ELECTRIC_USER=your_username"
echo "  WAKE_ELECTRIC_PASS=your_password"
echo ""
echo "Run with: python main.py"
