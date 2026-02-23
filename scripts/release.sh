#!/usr/bin/env bash
#
# Full release: build all platforms/archs and distribute to specified environments.
#
# Usage: source .env.signing && ./scripts/release.sh <env...>
#   env: local | dev | prod
#
# Builds:
#   macOS:    arm64 + x64 DMGs (signed + notarized)
#   Linux:    arm64 + x64 AppImages + debs (cross-compiled from macOS)
#   Linux:    arm64 + x64 RPMs (built on Linux VMs via SSH — rpmbuild not available on macOS)
#   Windows:  arm64 + x64 NSIS installers (built on Windows VM via SSH)
#
# Total: 10 artifacts per release.
#
# Build groups run in parallel:
#   Group A (local):  macOS arm64/x64 DMGs + Linux deb/AppImage
#   Group B (SSH):    Linux RPM arm64 on ubuntu-arm64
#   Group C (SSH):    Linux RPM x64 on ubuntu-x64
#   Group D (SSH):    Windows arm64+x64 on windows-arm64
#
# Requires env vars from .env.signing:
#   APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID (macOS notarization)
#   CERTUM_CERT_SHA1 (Windows code signing — SimplySign must be authenticated)
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

# --- Clean previous build artifacts ---
echo "Cleaning dist/..."
rm -rf dist/
mkdir -p dist/
echo ""

# --- VM config ---
WIN_HOST="windows-arm64"
WIN_PROJECT_DIR="C:\\Users\\erace\\ternity-desktop"
WIN_PATH="C:\\Program Files\\nodejs;C:\\Users\\erace\\AppData\\Roaming\\npm;C:\\Program Files\\Git\\bin;C:\\Program Files (x86)\\Windows Kits\\10\\bin\\10.0.18362.0\\x86"
LINUX_ARM64_HOST="ubuntu-arm64"
LINUX_X64_HOST="ubuntu-x64"
LINUX_PROJECT_DIR="ternity-desktop"  # relative to home dir (works with both ssh and scp)

# --- Log directory for parallel build output ---
BUILD_LOG_DIR=$(mktemp -d)
trap "rm -rf $BUILD_LOG_DIR" EXIT

# ============================================================
# PARALLEL BUILD GROUPS
# ============================================================
# Group B/C/D (SSH) start in background immediately.
# Group A (local) runs in foreground.
# All groups sync before distribution.
# ============================================================

echo "==> Starting parallel builds..."
echo "    Group A: macOS + Linux deb/AppImage (local, foreground)"
echo "    Group B: Linux RPM arm64 (SSH to ${LINUX_ARM64_HOST}, background)"
echo "    Group C: Linux RPM x64 (SSH to ${LINUX_X64_HOST}, background)"
echo "    Group D: Windows arm64+x64 (SSH to ${WIN_HOST}, background)"
echo ""

# --- Group B: Linux RPM arm64 (background) ---
(
  set -euo pipefail
  NVM_PREFIX="source ~/.nvm/nvm.sh 2>/dev/null;"
  echo "[B] Syncing and building RPM (arm64) on ${LINUX_ARM64_HOST}..."
  ssh "$LINUX_ARM64_HOST" "${NVM_PREFIX} cd ${LINUX_PROJECT_DIR} && git checkout -- . && git pull origin main --ff-only && rm -rf dist/ && pnpm install --frozen-lockfile"
  scp package.json "${LINUX_ARM64_HOST}:ternity-desktop/package.json"
  scp electron-builder.yml "${LINUX_ARM64_HOST}:ternity-desktop/electron-builder.yml"
  ssh "$LINUX_ARM64_HOST" "${NVM_PREFIX} cd ${LINUX_PROJECT_DIR} && pnpm exec electron-vite build && USE_SYSTEM_FPM=true pnpm electron-builder --linux rpm --arm64 --config electron-builder.yml"
  # Copy RPM artifact back
  for file in $(ssh "$LINUX_ARM64_HOST" "${NVM_PREFIX} ls ${LINUX_PROJECT_DIR}/dist/Ternity-Electron-*.rpm 2>/dev/null"); do
    BASENAME=$(basename "$file")
    scp "${LINUX_ARM64_HOST}:${LINUX_PROJECT_DIR}/dist/${BASENAME}" "dist/${BASENAME}"
    # Normalize arch name
    normalized="dist/${BASENAME}"
    normalized="${normalized//-aarch64./-arm64.}"
    if [ "dist/${BASENAME}" != "$normalized" ]; then
      mv "dist/${BASENAME}" "$normalized"
      echo "[B] Renamed: ${BASENAME} → $(basename "$normalized")"
    fi
  done
  echo "[B] Done — RPM arm64 complete"
) > "$BUILD_LOG_DIR/group-b.log" 2>&1 &
PID_B=$!

# --- Group C: Linux RPM x64 (background) ---
(
  set -euo pipefail
  NVM_PREFIX="source ~/.nvm/nvm.sh 2>/dev/null;"
  echo "[C] Syncing and building RPM (x64) on ${LINUX_X64_HOST}..."
  ssh "$LINUX_X64_HOST" "${NVM_PREFIX} cd ${LINUX_PROJECT_DIR} && git checkout -- . && git pull origin main --ff-only && rm -rf dist/ && pnpm install --frozen-lockfile"
  scp package.json "${LINUX_X64_HOST}:ternity-desktop/package.json"
  scp electron-builder.yml "${LINUX_X64_HOST}:ternity-desktop/electron-builder.yml"
  ssh "$LINUX_X64_HOST" "${NVM_PREFIX} cd ${LINUX_PROJECT_DIR} && pnpm exec electron-vite build && USE_SYSTEM_FPM=true pnpm electron-builder --linux rpm --x64 --config electron-builder.yml"
  # Copy RPM artifact back
  for file in $(ssh "$LINUX_X64_HOST" "${NVM_PREFIX} ls ${LINUX_PROJECT_DIR}/dist/Ternity-Electron-*.rpm 2>/dev/null"); do
    BASENAME=$(basename "$file")
    scp "${LINUX_X64_HOST}:${LINUX_PROJECT_DIR}/dist/${BASENAME}" "dist/${BASENAME}"
    # Normalize arch name
    normalized="dist/${BASENAME}"
    normalized="${normalized//-x86_64./-x64.}"
    if [ "dist/${BASENAME}" != "$normalized" ]; then
      mv "dist/${BASENAME}" "$normalized"
      echo "[C] Renamed: ${BASENAME} → $(basename "$normalized")"
    fi
  done
  echo "[C] Done — RPM x64 complete"
) > "$BUILD_LOG_DIR/group-c.log" 2>&1 &
PID_C=$!

# --- Group D: Windows (background) ---
(
  set -euo pipefail
  echo "[D] Syncing project to Windows VM..."
  ssh "$WIN_HOST" "set \"PATH=${WIN_PATH};%PATH%\" && cd ${WIN_PROJECT_DIR} && git checkout -- . && git pull --ff-only"
  scp electron-builder.yml "${WIN_HOST}:ternity-desktop/electron-builder.yml"
  scp package.json "${WIN_HOST}:ternity-desktop/package.json"
  scp scripts/win-sign.cjs "${WIN_HOST}:ternity-desktop/scripts/win-sign.cjs"

  SIGN_ENV=""
  if [ -n "${CERTUM_CERT_SHA1:-}" ]; then
    echo "[D] Windows code signing: ENABLED (thumbprint: ${CERTUM_CERT_SHA1:0:8}...)"
    SIGN_ENV="set \"CERTUM_CERT_SHA1=${CERTUM_CERT_SHA1}\" && "
  else
    echo "[D] Windows code signing: DISABLED (no CERTUM_CERT_SHA1)"
  fi

  echo "[D] Building Windows (arm64 + x64)..."
  ssh "$WIN_HOST" "set \"PATH=${WIN_PATH};%PATH%\" && ${SIGN_ENV}cd ${WIN_PROJECT_DIR} && pnpm install --frozen-lockfile && pnpm exec electron-vite build && pnpm electron-builder --win --arm64 --x64 --config electron-builder.yml"

  echo "[D] Copying Windows artifacts..."
  for arch in arm64 x64; do
    WIN_EXE="Ternity-Electron-${VERSION}-${arch}.exe"
    scp "${WIN_HOST}:ternity-desktop/dist/${WIN_EXE}" "dist/${WIN_EXE}"
  done
  echo "[D] Done — Windows complete"
) > "$BUILD_LOG_DIR/group-d.log" 2>&1 &
PID_D=$!

# --- Group A: macOS + Linux deb/AppImage (foreground) ---
echo "[A] Building renderer + main + preload..."
pnpm exec electron-vite build

echo "[A] Building macOS arm64..."
pnpm electron-builder --config electron-builder.yml --mac --arm64

echo "[A] Building DMG (arm64, sign + notarize)..."
pnpm tsx scripts/build-dmg.ts dist/mac-arm64/Ternity.app

echo "[A] Building macOS x64..."
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

echo "[A] Building DMG (x64, sign + notarize)..."
pnpm tsx scripts/build-dmg.ts "$MAC_X64_APP"

echo "[A] Building Linux (AppImage + deb, arm64 + x64)..."
pnpm electron-builder --config electron-builder.yml --linux deb AppImage --arm64 --x64

# Normalize arch names for Linux deb/AppImage
for file in dist/Ternity-Electron-${VERSION}-*.AppImage dist/Ternity-Electron-${VERSION}-*.deb; do
  [ -f "$file" ] || continue
  normalized="$file"
  normalized="${normalized//-x86_64./-x64.}"
  normalized="${normalized//-amd64./-x64.}"
  if [ "$normalized" != "$file" ]; then
    mv "$file" "$normalized"
    echo "[A] Renamed: $(basename "$file") → $(basename "$normalized")"
  fi
done

echo "[A] Done — macOS + Linux deb/AppImage complete"
echo ""

# ============================================================
# WAIT FOR BACKGROUND GROUPS
# ============================================================

echo "==> Waiting for background builds..."
FAILED=false

for GROUP_INFO in "B:$PID_B:group-b:RPM arm64" "C:$PID_C:group-c:RPM x64" "D:$PID_D:group-d:Windows"; do
  GROUP_LABEL="${GROUP_INFO%%:*}"
  REST="${GROUP_INFO#*:}"
  GROUP_PID="${REST%%:*}"
  REST="${REST#*:}"
  GROUP_LOG="${REST%%:*}"
  GROUP_DESC="${REST#*:}"

  if wait "$GROUP_PID"; then
    echo "  [${GROUP_LABEL}] ${GROUP_DESC} — OK"
  else
    echo "  [${GROUP_LABEL}] ${GROUP_DESC} — FAILED"
    echo "  --- Log (${GROUP_LOG}) ---"
    cat "$BUILD_LOG_DIR/${GROUP_LOG}.log"
    echo "  --- End log ---"
    FAILED=true
  fi
done

# Show background logs for reference
echo ""
echo "==> Background build logs:"
for log in "$BUILD_LOG_DIR"/group-*.log; do
  [ -f "$log" ] || continue
  LABEL=$(basename "$log" .log | tr '[:lower:]' '[:upper:]' | sed 's/GROUP-//')
  echo "  --- [${LABEL}] ---"
  tail -3 "$log"
  echo ""
done

if [ "$FAILED" = true ]; then
  echo "Error: one or more background builds failed. Aborting." >&2
  exit 1
fi

# ============================================================
# COLLECT ARTIFACTS
# ============================================================

ARTIFACTS=()
for file in \
  "dist/Ternity-Electron-${VERSION}-arm64.dmg" \
  "dist/Ternity-Electron-${VERSION}-x64.dmg" \
  "dist/Ternity-Electron-${VERSION}-arm64.AppImage" \
  "dist/Ternity-Electron-${VERSION}-x64.AppImage" \
  "dist/Ternity-Electron-${VERSION}-arm64.deb" \
  "dist/Ternity-Electron-${VERSION}-x64.deb" \
  "dist/Ternity-Electron-${VERSION}-arm64.rpm" \
  "dist/Ternity-Electron-${VERSION}-x64.rpm" \
  "dist/Ternity-Electron-${VERSION}-arm64.exe" \
  "dist/Ternity-Electron-${VERSION}-x64.exe"; do
  ARTIFACTS+=("$file")
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
