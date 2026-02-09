#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="docker-compose.prod.yml"
SERVICE_NAME="rental-mgmt-prod"

usage() {
  echo "Usage: $0 {deploy|stop|restart|logs|status}"
  echo ""
  echo "  deploy   Build and start production container"
  echo "  stop     Stop production container"
  echo "  restart  Rebuild and restart production container"
  echo "  logs     Tail production logs"
  echo "  status   Show container status and health"
}

case "${1:-}" in
  deploy)
    echo "Building and starting production..."
    docker compose -f "$COMPOSE_FILE" build
    docker compose -f "$COMPOSE_FILE" up -d
    echo "Waiting for health check..."
    sleep 5
    curl -s http://localhost:3000/api/health | python3 -m json.tool 2>/dev/null || echo "Health check pending..."
    ;;
  stop)
    echo "Stopping production..."
    docker compose -f "$COMPOSE_FILE" down
    ;;
  restart)
    echo "Rebuilding and restarting production..."
    docker compose -f "$COMPOSE_FILE" down
    docker compose -f "$COMPOSE_FILE" build
    docker compose -f "$COMPOSE_FILE" up -d
    echo "Waiting for health check..."
    sleep 5
    curl -s http://localhost:3000/api/health | python3 -m json.tool 2>/dev/null || echo "Health check pending..."
    ;;
  logs)
    docker compose -f "$COMPOSE_FILE" logs -f
    ;;
  status)
    docker compose -f "$COMPOSE_FILE" ps
    echo ""
    echo "Health:"
    curl -s http://localhost:3000/api/health | python3 -m json.tool 2>/dev/null || echo "Container not responding"
    ;;
  *)
    usage
    exit 1
    ;;
esac
