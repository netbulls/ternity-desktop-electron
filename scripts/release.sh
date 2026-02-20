#!/usr/bin/env bash
#
# Full release: build all platforms/archs and distribute to specified environments.
#
# Usage: source .env.signing && ./scripts/release.sh <env...>
#   env: local | dev | prod
#
# Builds:
#   macOS:    arm64 + x64 DMGs (signed + notarized)
#   Linux:    arm64 + x64 AppImages + debs
#   Windows:  arm64 + x64 NSIS installers (built on Windows VM via SSH)
#
# Total: 8 artifacts per release.
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

# --- Extract release notes from CHANGELOG.md ---
NOTES=""
if [ -f CHANGELOG.md ]; then
  # Extract the section for this version, or [Unreleased] for snapshot builds
  if echo "$VERSION" | grep -q '-'; then
    SECTION_HEADER="Unreleased"
  else
    SECTION_HEADER="$VERSION"
  fi
  # Extract everything between this section header and the next ## [
  NOTES=$(awk -v header="$SECTION_HEADER" '
    $0 ~ "^## \\[" header "\\]" { found=1; next }
    found && /^## \[/ { exit }
    found { print }
  ' CHANGELOG.md | sed '/^[[:space:]]*$/d' | head -100)
fi

if [ -n "$NOTES" ]; then
  echo "Release notes extracted from CHANGELOG.md:"
  echo "$NOTES" | head -5
  [ "$(echo "$NOTES" | wc -l)" -gt 5 ] && echo "  ..."
  echo ""
else
  echo "No release notes found in CHANGELOG.md"
  echo ""
fi

ARTIFACTS=()

# --- Windows VM config ---
WIN_HOST="windows-arm64"
WIN_PROJECT_DIR="C:\\Users\\erace\\ternity-desktop"
WIN_PATH="C:\\Program Files\\nodejs;C:\\Users\\erace\\AppData\\Roaming\\npm;C:\\Program Files\\Git\\bin"

# --- macOS arm64 ---
echo "==> [1/7] Building macOS arm64..."
pnpm electron-builder --config electron-builder.yml --mac --arm64

echo "==> [2/7] Building DMG (arm64, sign + notarize)..."
pnpm tsx scripts/build-dmg.ts dist/mac-arm64/Ternity.app
ARTIFACTS+=("dist/Ternity-Electron-${VERSION}-arm64.dmg")

# --- macOS x64 ---
echo "==> [3/7] Building macOS x64..."
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

echo "==> [4/7] Building DMG (x64, sign + notarize)..."
pnpm tsx scripts/build-dmg.ts "$MAC_X64_APP"
ARTIFACTS+=("dist/Ternity-Electron-${VERSION}-x64.dmg")

# --- Linux (all archs, all targets) ---
echo "==> [5/7] Building Linux (AppImage + deb, arm64 + x64)..."
pnpm electron-builder --config electron-builder.yml --linux deb AppImage --arm64 --x64

# electron-builder uses platform-native arch names (x86_64 for AppImage, amd64 for deb)
# so we glob for actual files instead of assuming names
for file in dist/Ternity-Electron-${VERSION}-*.AppImage dist/Ternity-Electron-${VERSION}-*.deb; do
  [ -f "$file" ] && ARTIFACTS+=("$file")
done

# --- Windows (built on Windows VM via SSH) ---
echo "==> [6/7] Building Windows (arm64 + x64 via SSH to ${WIN_HOST})..."
echo "  Syncing project to Windows VM..."
# Pull latest code, sync config files with version already injected
ssh "$WIN_HOST" "set \"PATH=${WIN_PATH};%PATH%\" && cd ${WIN_PROJECT_DIR} && git pull --ff-only" || true
scp electron-builder.yml "${WIN_HOST}:ternity-desktop/electron-builder.yml"
scp package.json "${WIN_HOST}:ternity-desktop/package.json"

echo "==> [7/7] Running Windows build..."
# Skip version-inject (package.json already has correct version from scp)
# Run electron-vite build directly, then electron-builder
ssh "$WIN_HOST" "set \"PATH=${WIN_PATH};%PATH%\" && cd ${WIN_PROJECT_DIR} && pnpm install --frozen-lockfile && pnpm exec electron-vite build && pnpm electron-builder --win --arm64 --x64 --config electron-builder.yml"

echo "  Copying Windows artifacts..."
for arch in arm64 x64; do
  WIN_EXE="Ternity-Electron-${VERSION}-${arch}.exe"
  scp "${WIN_HOST}:ternity-desktop/dist/${WIN_EXE}" "dist/${WIN_EXE}"
  [ -f "dist/${WIN_EXE}" ] && ARTIFACTS+=("dist/${WIN_EXE}")
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

# --- Push release notes ---
VPS_HOST="${DRIVE_VPS_HOST:-89.167.28.70}"
VPS_USER="${DRIVE_VPS_USER:-deploy}"

if [ -n "$NOTES" ]; then
  echo "=== Pushing release notes (v${VERSION}) ==="
  for ENV in "${ENVS[@]}"; do
    case "$ENV" in
      local)
        DRIVE_URL="http://localhost:3020"
        API_KEY="${DRIVE_LOCAL_API_KEY:-}"
        ;;
      dev)
        CONTAINER_IP=$(ssh "${VPS_USER}@${VPS_HOST}" \
          "docker inspect --format='{{range .NetworkSettings.Networks}}{{.IPAddress}}{{\"\\n\"}}{{end}}' ternity-drive-dev" \
          | grep -oE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | head -1)
        DRIVE_URL="http://${CONTAINER_IP}:3020"
        API_KEY="${DRIVE_DEV_API_KEY:-}"
        ;;
      prod)
        CONTAINER_IP=$(ssh "${VPS_USER}@${VPS_HOST}" \
          "docker inspect --format='{{range .NetworkSettings.Networks}}{{.IPAddress}}{{\"\\n\"}}{{end}}' ternity-drive-prod" \
          | grep -oE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | head -1)
        DRIVE_URL="http://${CONTAINER_IP}:3020"
        API_KEY="${DRIVE_PROD_API_KEY:-}"
        ;;
    esac

    echo -n "  $ENV: "
    if [ "$ENV" = "local" ]; then
      HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
        -X PUT "${DRIVE_URL}/api/releases/${VERSION}/notes" \
        -H "Authorization: Bearer $API_KEY" \
        -H "Content-Type: text/markdown" \
        -d "$NOTES")
    else
      HTTP_CODE=$(ssh "${VPS_USER}@${VPS_HOST}" \
        "curl -s -o /dev/null -w '%{http_code}' \
        -X PUT '${DRIVE_URL}/api/releases/${VERSION}/notes' \
        -H 'Authorization: Bearer $API_KEY' \
        -H 'Content-Type: text/markdown' \
        -d '$(echo "$NOTES" | sed "s/'/'\\\\''/g")'")
    fi

    if [ "$HTTP_CODE" = "200" ]; then
      echo "OK"
    else
      echo "FAILED (HTTP $HTTP_CODE)"
    fi
  done
  echo ""
fi

echo "=== Done ==="
echo "  Version:      v${VERSION}"
echo "  Artifacts:    ${#ARTIFACTS[@]}"
echo "  Notes:        $([ -n "$NOTES" ] && echo "pushed" || echo "none")"
echo "  Environments: ${ENVS[*]}"
