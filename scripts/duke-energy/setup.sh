#!/bin/bash
# Setup script for Duke Energy scraper

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$SCRIPT_DIR/.venv"

echo "Setting up Duke Energy scraper..."

# Create virtual environment
if [ ! -d "$VENV_DIR" ]; then
    echo "Creating virtual environment..."
    python3 -m venv "$VENV_DIR"
fi

# Activate and install dependencies
source "$VENV_DIR/bin/activate"

echo "Installing dependencies..."
pip install --upgrade pip
pip install -r "$SCRIPT_DIR/requirements.txt"

echo "Installing Playwright browsers..."
playwright install chromium

echo "Setup complete!"
echo ""
echo "To use the scraper, set these environment variables in .env.local:"
echo "  DUKE_ENERGY_USER=your_email"
echo "  DUKE_ENERGY_PASS=your_password"
