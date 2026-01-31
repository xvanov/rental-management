#!/bin/bash
# Setup script for Durham Water scraper

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$SCRIPT_DIR/.venv"

echo "Setting up Durham Water scraper..."

# Check for Python 3
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is required but not installed."
    exit 1
fi

# Create virtual environment if it doesn't exist
if [ ! -d "$VENV_DIR" ]; then
    echo "Creating virtual environment..."
    python3 -m venv "$VENV_DIR"
fi

# Activate virtual environment
source "$VENV_DIR/bin/activate"

# Install dependencies
echo "Installing dependencies..."
pip install --upgrade pip
pip install -r "$SCRIPT_DIR/requirements.txt"

# Install playwright browsers
echo "Installing Playwright browsers..."
playwright install chromium

echo ""
echo "Setup complete!"
echo ""
echo "To run the scraper:"
echo "  source $VENV_DIR/bin/activate"
echo "  python $SCRIPT_DIR/main.py"
echo ""
echo "Options:"
echo "  --visible    Show browser window (for debugging)"
echo "  --parse-only Parse existing PDFs only"
echo "  --test       Test parser with sample files"
echo "  --json       Output as JSON"
echo "  --output FILE Save results to file"
