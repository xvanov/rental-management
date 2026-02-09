#!/bin/bash

# Start the Next.js dev server and ngrok tunnel
# Logs are written to start.log (overwritten each run)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_FILE="$SCRIPT_DIR/start.log"
PORT=3000

# Overwrite the log file
> "$LOG_FILE"

log() {
  echo "$1" | tee -a "$LOG_FILE"
}

cleanup() {
  log ""
  log "$(date '+%Y-%m-%d %H:%M:%S') - Shutting down..."
  # Kill background processes
  if [ -n "$NEXT_PID" ] && kill -0 "$NEXT_PID" 2>/dev/null; then
    kill "$NEXT_PID" 2>/dev/null
    log "Stopped Next.js (PID $NEXT_PID)"
  fi
  if [ -n "$NGROK_PID" ] && kill -0 "$NGROK_PID" 2>/dev/null; then
    kill "$NGROK_PID" 2>/dev/null
    log "Stopped ngrok (PID $NGROK_PID)"
  fi
  exit 0
}

trap cleanup SIGINT SIGTERM

# Check for ngrok
if ! command -v ngrok &>/dev/null; then
  log "ERROR: ngrok is not installed."
  log "Install it with: sudo snap install ngrok"
  exit 1
fi

log "========================================"
log "  Rental Management - Dev Server + ngrok"
log "========================================"
log "$(date '+%Y-%m-%d %H:%M:%S') - Starting up..."
log "Log file: $LOG_FILE"
log ""

# Start Next.js dev server
log "Starting Next.js on port $PORT..."
cd "$SCRIPT_DIR"
npm run dev >> "$LOG_FILE" 2>&1 &
NEXT_PID=$!
log "Next.js PID: $NEXT_PID"

# Wait for Next.js to be ready
log "Waiting for Next.js to be ready..."
for i in $(seq 1 30); do
  if curl -s "http://localhost:$PORT" >/dev/null 2>&1; then
    log "Next.js is ready!"
    break
  fi
  if ! kill -0 "$NEXT_PID" 2>/dev/null; then
    log "ERROR: Next.js process died. Check $LOG_FILE for details."
    exit 1
  fi
  sleep 1
done

# Start ngrok
log ""
log "Starting ngrok tunnel on port $PORT..."
ngrok http "$PORT" --log=stdout >> "$LOG_FILE" 2>&1 &
NGROK_PID=$!
log "ngrok PID: $NGROK_PID"

# Wait a moment for ngrok to establish the tunnel
sleep 3

# Fetch the public URL from ngrok's local API
NGROK_URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null | grep -o '"public_url":"[^"]*"' | head -1 | cut -d'"' -f4)

log ""
log "========================================"
if [ -n "$NGROK_URL" ]; then
  log "  Local:  http://localhost:$PORT"
  log "  Public: $NGROK_URL"

  # Update NEXT_PUBLIC_APP_URL in .env.local
  ENV_FILE="$SCRIPT_DIR/.env.local"
  if [ -f "$ENV_FILE" ] && grep -q "^NEXT_PUBLIC_APP_URL=" "$ENV_FILE"; then
    sed -i "s|^NEXT_PUBLIC_APP_URL=.*|NEXT_PUBLIC_APP_URL=$NGROK_URL|" "$ENV_FILE"
  else
    echo "NEXT_PUBLIC_APP_URL=$NGROK_URL" >> "$ENV_FILE"
  fi
  log "  Updated .env.local with NEXT_PUBLIC_APP_URL=$NGROK_URL"
else
  log "  Local:  http://localhost:$PORT"
  log "  Public: (check http://localhost:4040 for ngrok URL)"
fi
log "========================================"
log ""
log "Press Ctrl+C to stop both services."

# Keep the script running
wait
