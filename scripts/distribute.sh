#!/usr/bin/env bash
#
# Upload a build artifact to Ternity Drive.
#
# Usage: ./scripts/distribute.sh <file> <env>
#   env: local | dev | prod
#
# For dev/prod, opens a temporary SSH tunnel through the VPS to reach the
# Drive container's internal port (not exposed publicly via Caddy).
#
# If DRIVE_UPLOAD_URL is set (e.g., by release.sh), uses it directly
# instead of opening a new tunnel — enables persistent tunnel reuse.
#
# Requires env vars from .env.signing:
#   DRIVE_{LOCAL|DEV|PROD}_API_KEY
#   DRIVE_VPS_HOST (for dev/prod)
#
# Examples:
#   source .env.signing && ./scripts/distribute.sh dist/Ternity-Electron-1.0.0-arm64.dmg local
#   source .env.signing && ./scripts/distribute.sh dist/Ternity-Electron-1.0.0-arm64.dmg dev
#   source .env.signing && ./scripts/distribute.sh dist/Ternity-Electron-1.0.0-x64.AppImage prod
#

set -euo pipefail

# ── Args ─────────────────────────────────────────────────────────────────────

usage() {
  echo "Usage: $0 <file> <env>"
  echo "  env: local | dev | prod"
  exit 1
}

[ "${1:-}" ] || usage
[ "${2:-}" ] || usage

FILE="$1"
ENV="$2"

VPS_HOST="${DRIVE_VPS_HOST:-89.167.28.70}"
VPS_USER="${DRIVE_VPS_USER:-deploy}"

TUNNEL_PID=""

cleanup() {
  if [ -n "$TUNNEL_PID" ]; then
    kill "$TUNNEL_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# ── Resolve env config ────────────────────────────────────────────────────────

case "$ENV" in
  local)
    UPLOAD_URL="http://localhost:3020"
    API_KEY="${DRIVE_LOCAL_API_KEY:-}"
    ;;
  dev)
    CONTAINER="ternity-drive-dev"
    TUNNEL_PORT=13020
    API_KEY="${DRIVE_DEV_API_KEY:-}"
    ;;
  prod)
    CONTAINER="ternity-drive-prod"
    TUNNEL_PORT=13021
    API_KEY="${DRIVE_PROD_API_KEY:-}"
    ;;
  *)
    echo "Error: env must be 'local', 'dev', or 'prod'" >&2
    exit 1
    ;;
esac

# ── Validate ──────────────────────────────────────────────────────────────────

[ -f "$FILE" ] || { echo "Error: file not found: $FILE" >&2; exit 1; }

if [ -z "${API_KEY:-}" ]; then
  echo "Error: DRIVE_${ENV^^}_API_KEY not set. Run: source .env.signing" >&2
  exit 1
fi

FILENAME=$(basename "$FILE")
FILESIZE=$(du -sh "$FILE" | cut -f1)

echo "Uploading to Drive ($ENV)"
echo "  File:   $FILENAME ($FILESIZE)"

# ── SSH tunnel (dev/prod only) ────────────────────────────────────────────────

if [ -n "${DRIVE_UPLOAD_URL:-}" ]; then
  # Persistent tunnel provided by caller (e.g., release.sh) — reuse it
  UPLOAD_URL="$DRIVE_UPLOAD_URL"
  echo "  Using existing tunnel: $UPLOAD_URL"
elif [ "$ENV" = "dev" ] || [ "$ENV" = "prod" ]; then
  echo "  Opening SSH tunnel → $VPS_HOST ($CONTAINER:3020 via port $TUNNEL_PORT)..."

  # Resolve the container's bridge IP on the VPS
  CONTAINER_IP=$(ssh "${VPS_USER}@${VPS_HOST}" \
    "docker inspect --format='{{range .NetworkSettings.Networks}}{{.IPAddress}}{{\"\n\"}}{{end}}' ${CONTAINER}" \
    | grep -oE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | head -1)

  if [ -z "$CONTAINER_IP" ]; then
    echo "Error: could not resolve IP for container '$CONTAINER'" >&2
    exit 1
  fi

  echo "  Container IP: $CONTAINER_IP"

  # Open tunnel in background
  ssh -N -L "${TUNNEL_PORT}:${CONTAINER_IP}:3020" "${VPS_USER}@${VPS_HOST}" &
  TUNNEL_PID=$!

  # Wait for tunnel to be ready
  for i in $(seq 1 10); do
    if curl -s "http://localhost:${TUNNEL_PORT}/health" >/dev/null 2>&1; then
      break
    fi
    sleep 0.5
  done

  UPLOAD_URL="http://localhost:${TUNNEL_PORT}"
  echo "  Tunnel ready"
fi

echo "  Target: $UPLOAD_URL"

# ── Upload ────────────────────────────────────────────────────────────────────

RESPONSE_BODY_FILE=$(mktemp)
HTTP_CODE=$(curl -s \
  -o "$RESPONSE_BODY_FILE" \
  -w "%{http_code}" \
  -X POST "$UPLOAD_URL/api/artifacts" \
  -H "Authorization: Bearer $API_KEY" \
  -F "file=@$FILE;filename=$FILENAME")
BODY=$(cat "$RESPONSE_BODY_FILE")
rm -f "$RESPONSE_BODY_FILE"

echo ""

if [ "$HTTP_CODE" = "201" ]; then
  echo "Upload successful (HTTP 201)"
  echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
elif [ "$HTTP_CODE" = "409" ]; then
  echo "Already exists — deleting and re-uploading..."

  # Get the artifact ID
  LIST_BODY_FILE=$(mktemp)
  curl -s -o "$LIST_BODY_FILE" "$UPLOAD_URL/api/artifacts"
  ARTIFACT_ID=$(python3 -c "
import json, sys
data = json.load(open('$LIST_BODY_FILE'))
for a in data['artifacts']:
    if a['filename'] == '$FILENAME':
        print(a['id'])
        break
" 2>/dev/null)
  rm -f "$LIST_BODY_FILE"

  if [ -z "$ARTIFACT_ID" ]; then
    echo "Error: could not find artifact ID for $FILENAME" >&2
    exit 1
  fi

  # Delete
  curl -s -X DELETE "$UPLOAD_URL/api/artifacts/$ARTIFACT_ID" \
    -H "Authorization: Bearer $API_KEY" >/dev/null

  # Re-upload
  RESPONSE_BODY_FILE2=$(mktemp)
  HTTP_CODE2=$(curl -s \
    -o "$RESPONSE_BODY_FILE2" \
    -w "%{http_code}" \
    -X POST "$UPLOAD_URL/api/artifacts" \
    -H "Authorization: Bearer $API_KEY" \
    -F "file=@$FILE;filename=$FILENAME")
  BODY2=$(cat "$RESPONSE_BODY_FILE2")
  rm -f "$RESPONSE_BODY_FILE2"

  if [ "$HTTP_CODE2" = "201" ]; then
    echo "Upload successful (HTTP 201)"
    echo "$BODY2" | python3 -m json.tool 2>/dev/null || echo "$BODY2"
  else
    echo "Re-upload failed (HTTP $HTTP_CODE2)" >&2
    echo "$BODY2" >&2
    exit 1
  fi
else
  echo "Upload failed (HTTP $HTTP_CODE)" >&2
  echo "$BODY" >&2
  exit 1
fi
