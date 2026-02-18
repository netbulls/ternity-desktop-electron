#!/usr/bin/env bash
#
# Smoke test a Linux AppImage on the VPS via Docker.
#
# Copies the AppImage to the VPS, runs it inside an ubuntu:22.04 container
# with a virtual display (Xvfb), and checks the process is still alive
# after a few seconds.
#
# Usage: ./scripts/test-linux.sh <appimage>
#
# Requires SSH access: deploy@VPS_HOST (key-based, no password prompt).
# VPS_HOST defaults to $DRIVE_VPS_HOST or 89.167.28.70.
#
# Examples:
#   ./scripts/test-linux.sh dist/Ternity-1.0.0-arm64.AppImage
#   source .env.signing && ./scripts/test-linux.sh dist/Ternity-*.AppImage
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

VPS_HOST="${DRIVE_VPS_HOST:-89.167.28.70}"
VPS_USER="${DRIVE_VPS_USER:-deploy}"
CONTAINER_NAME="ternity-desktop-test"
REMOTE_DIR="/tmp/ternity-desktop-test"

# ── Args ──────────────────────────────────────────────────────────────────────

usage() {
  echo "Usage: $0 <appimage>"
  exit 1
}

[ "${1:-}" ] || usage
APPIMAGE="$1"
[ -f "$APPIMAGE" ] || { echo "Error: file not found: $APPIMAGE" >&2; exit 1; }
FILENAME=$(basename "$APPIMAGE")

# ── Cleanup ───────────────────────────────────────────────────────────────────

cleanup() {
  ssh "${VPS_USER}@${VPS_HOST}" \
    "docker rm -f ${CONTAINER_NAME} 2>/dev/null || true; rm -rf ${REMOTE_DIR}" \
    2>/dev/null || true
}
trap cleanup EXIT

# ── Upload ────────────────────────────────────────────────────────────────────

echo "Smoke testing: $FILENAME"
echo "  Copying to VPS (${VPS_HOST})..."
ssh "${VPS_USER}@${VPS_HOST}" "mkdir -p ${REMOTE_DIR}"
scp -q "$APPIMAGE" "${VPS_USER}@${VPS_HOST}:${REMOTE_DIR}/${FILENAME}"
echo "  Copied ($(du -sh "$APPIMAGE" | cut -f1))"

# ── Write inner test script ───────────────────────────────────────────────────
# Written to a local temp file then SCPed to avoid SSH quoting issues.

INNER_SCRIPT=$(mktemp /tmp/ternity-linux-test-XXXXXX.sh)
cat > "$INNER_SCRIPT" << 'INNER'
#!/usr/bin/env bash
set -euo pipefail

APPIMAGE=$(ls /app/*.AppImage 2>/dev/null | head -1)
[ -n "$APPIMAGE" ] || { echo "FAIL: no AppImage found in /app"; exit 1; }
FILENAME=$(basename "$APPIMAGE")

echo "  AppImage: $FILENAME"
echo "  Arch:     $(file "$APPIMAGE" | grep -oE 'ELF (32|64)-bit \S+ \S+')"

echo "  Installing runtime deps..."
apt-get update -qq >/dev/null 2>&1
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
  file xvfb \
  libglib2.0-0 libnss3 libnspr4 \
  libatk1.0-0 libatk-bridge2.0-0 \
  libcups2 libdrm2 libgtk-3-0 libgbm1 \
  libasound2 libxss1 libx11-xcb1 \
  libxcomposite1 libxdamage1 libxrandr2 libxfixes3 \
  >/dev/null 2>&1
echo "  Deps ready"

chmod +x "$APPIMAGE"

echo "  Starting Xvfb..."
Xvfb :99 -screen 0 1024x768x24 &
XVFB_PID=$!
sleep 1

echo "  Launching app..."
DISPLAY=:99 "$APPIMAGE" --appimage-extract-and-run --no-sandbox \
  >/tmp/app-stdout.log 2>/tmp/app-stderr.log &
APP_PID=$!

sleep 8

if kill -0 "$APP_PID" 2>/dev/null; then
  echo ""
  echo "PASS — process still running after 8s (PID $APP_PID)"
  kill "$APP_PID" 2>/dev/null || true
  kill "$XVFB_PID" 2>/dev/null || true
  exit 0
else
  echo ""
  echo "FAIL — process exited early"
  echo ""
  echo "--- stderr ---"
  cat /tmp/app-stderr.log
  echo "--- stdout ---"
  cat /tmp/app-stdout.log
  kill "$XVFB_PID" 2>/dev/null || true
  exit 1
fi
INNER

scp -q "$INNER_SCRIPT" "${VPS_USER}@${VPS_HOST}:${REMOTE_DIR}/run-test.sh"
rm -f "$INNER_SCRIPT"

# ── Run in Docker ─────────────────────────────────────────────────────────────

echo "  Running in Docker (ubuntu:22.04)..."
echo ""

ssh "${VPS_USER}@${VPS_HOST}" \
  "docker run --rm \
    --name ${CONTAINER_NAME} \
    -v ${REMOTE_DIR}:/app \
    ubuntu:22.04 \
    bash /app/run-test.sh"

STATUS=$?
echo ""
if [ $STATUS -eq 0 ]; then
  echo "✓ $FILENAME — smoke test passed"
else
  echo "✗ $FILENAME — smoke test failed"
  exit 1
fi
