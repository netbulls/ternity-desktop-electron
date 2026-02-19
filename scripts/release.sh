#!/usr/bin/env bash
#
# Full release: build all platforms/archs and distribute to specified environments.
#
# Usage: source .env.signing && ./scripts/release.sh <env...>
#   env: local | dev | prod
#
# Builds:
#   macOS:  arm64 + x64 DMGs (signed + notarized)
#   Linux:  arm64 + x64 AppImages + debs
#
# Total: 6 artifacts per release.
#
# Requires env vars from .env.signing:
#   APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID (macOS notarization)
#   DRIVE_{LOCAL|DEV|PROD}_API_KEY (upload)
#   DRIVE_VPS_HOST (for dev/prod)
#
# Examples:
#   source .env.signing && ./scripts/release.sh dev prod
#   source .env.signing && ./scripts/release.sh dev
#

set -euo pipefail

ENVS=("$@")
if [ ${#ENVS[@]} -eq 0 ]; then
  echo "Usage: $0 <env...>"
  echo "  env: local | dev | prod"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# --- Version inject ---
VERSION=$(git describe --tags --always | sed 's/^v//')
node -e "
  const fs = require('fs');
  const p = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  p.version = '$VERSION';
  fs.writeFileSync('package.json', JSON.stringify(p, null, 2) + '\n');
"

echo "=== Release v${VERSION} ==="
echo "Environments: ${ENVS[*]}"
echo ""

ARTIFACTS=()

# --- macOS arm64 ---
echo "==> [1/5] Building macOS arm64..."
pnpm electron-builder --config electron-builder.yml --mac --arm64

echo "==> [2/5] Building DMG (arm64, sign + notarize)..."
pnpm tsx scripts/build-dmg.ts dist/mac-arm64/Ternity.app
ARTIFACTS+=("dist/Ternity-Electron-${VERSION}-arm64.dmg")

# --- macOS x64 ---
echo "==> [3/5] Building macOS x64..."
pnpm electron-builder --config electron-builder.yml --mac --x64

# electron-builder outputs x64 to dist/mac/ on arm64 hosts
MAC_X64_APP="dist/mac/Ternity.app"
if [ ! -d "$MAC_X64_APP" ]; then
  MAC_X64_APP="dist/mac-x64/Ternity.app"
fi
if [ ! -d "$MAC_X64_APP" ]; then
  echo "Error: x64 .app not found in dist/mac/ or dist/mac-x64/" >&2
  exit 1
fi

echo "==> [4/5] Building DMG (x64, sign + notarize)..."
pnpm tsx scripts/build-dmg.ts "$MAC_X64_APP"
ARTIFACTS+=("dist/Ternity-Electron-${VERSION}-x64.dmg")

# --- Linux (all archs, all targets) ---
echo "==> [5/5] Building Linux (AppImage + deb, arm64 + x64)..."
pnpm electron-builder --config electron-builder.yml --linux deb AppImage --arm64 --x64

for ARCH in arm64 x64; do
  ARTIFACTS+=("dist/Ternity-Electron-${VERSION}-${ARCH}.AppImage")
  ARTIFACTS+=("dist/Ternity-Electron-${VERSION}-${ARCH}.deb")
done

# --- Verify all artifacts exist ---
echo ""
echo "=== ${#ARTIFACTS[@]} artifacts ==="
ALL_OK=true
for a in "${ARTIFACTS[@]}"; do
  if [ -f "$a" ]; then
    echo "  $(basename "$a")  ($(du -sh "$a" | cut -f1))"
  else
    echo "  MISSING: $(basename "$a")"
    ALL_OK=false
  fi
done

if [ "$ALL_OK" = false ]; then
  echo ""
  echo "Error: some artifacts are missing. Aborting distribution." >&2
  exit 1
fi

# --- Distribute ---
echo ""
for ENV in "${ENVS[@]}"; do
  echo "=== Distributing to $ENV ==="
  for a in "${ARTIFACTS[@]}"; do
    echo "  -> $(basename "$a")"
    "$SCRIPT_DIR/distribute.sh" "$a" "$ENV"
    echo ""
  done
done

echo "=== Done ==="
echo "  Version:      v${VERSION}"
echo "  Artifacts:    ${#ARTIFACTS[@]}"
echo "  Environments: ${ENVS[*]}"
