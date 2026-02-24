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

# --- Pre-flight git checks ---
PREFLIGHT_FAIL=false

UNTRACKED=$(git ls-files --others --exclude-standard -- src/)
if [ -n "$UNTRACKED" ]; then
  echo "ABORT: Untracked files in src/ — commit or remove them before releasing:"
  echo "$UNTRACKED" | sed 's/^/  /'
  PREFLIGHT_FAIL=true
fi

UNCOMMITTED=$(git diff --name-only -- src/)
if [ -n "$UNCOMMITTED" ]; then
  echo "ABORT: Uncommitted changes in src/ — commit or stash them before releasing:"
  echo "$UNCOMMITTED" | sed 's/^/  /'
  PREFLIGHT_FAIL=true
fi

LOCAL_HEAD=$(git rev-parse HEAD)
ORIGIN_MAIN=$(git rev-parse origin/main 2>/dev/null || echo "")
if [ -n "$ORIGIN_MAIN" ] && [ "$LOCAL_HEAD" != "$ORIGIN_MAIN" ]; then
  echo "ABORT: Local HEAD ($LOCAL_HEAD) differs from origin/main ($ORIGIN_MAIN)"
  echo "  Push your changes or pull the latest before releasing."
  PREFLIGHT_FAIL=true
fi

if [ "$PREFLIGHT_FAIL" = true ]; then
  exit 1
fi

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

VPS_HOST="${DRIVE_VPS_HOST:-89.167.28.70}"
VPS_USER="${DRIVE_VPS_USER:-deploy}"

# --- VM name mapping (SSH host → Parallels VM name) ---
vm_name_for_host() {
  case "$1" in
    ubuntu-arm64)  echo "Ubuntu 24.04.3 ARM64" ;;
    ubuntu-x64)    echo "Ubuntu 24.04 (with Rosetta)" ;;
    windows-arm64) echo "Windows 10 ARM" ;;
    *)             echo "" ;;
  esac
}

# --- Ensure VM is reachable, auto-boot if needed ---
# Returns 0 if reachable, 1 if not (caller should skip the group).
ensure_vm_ready() {
  local host="$1"

  # Quick SSH ping
  if ssh -o ConnectTimeout=2 -o BatchMode=yes "$host" "exit 0" 2>/dev/null; then
    return 0
  fi

  echo "  $host: SSH unreachable, checking Parallels..."

  # If prlctl isn't available, can't auto-boot
  if ! command -v prlctl >/dev/null 2>&1; then
    echo "  $host: prlctl not available — cannot auto-boot"
    return 1
  fi

  local vm_name
  vm_name=$(vm_name_for_host "$host")
  if [ -z "$vm_name" ]; then
    echo "  $host: no VM name mapping — cannot auto-boot"
    return 1
  fi

  local vm_state
  vm_state=$(prlctl status "$vm_name" 2>/dev/null | sed 's/.*is //' || echo "unknown")

  case "$vm_state" in
    stopped)
      echo "  $host: VM is stopped — starting..."
      prlctl start "$vm_name" >/dev/null 2>&1
      ;;
    suspended|paused)
      echo "  $host: VM is $vm_state — resuming..."
      prlctl resume "$vm_name" >/dev/null 2>&1
      ;;
    running)
      echo "  $host: VM is running but SSH not ready — waiting..."
      ;;
    *)
      echo "  $host: VM state '$vm_state' — cannot auto-boot"
      return 1
      ;;
  esac

  # Poll SSH every 3s for up to 60s
  local attempts=20
  local i
  for i in $(seq 1 $attempts); do
    if ssh -o ConnectTimeout=2 -o BatchMode=yes "$host" "exit 0" 2>/dev/null; then
      echo "  $host: SSH ready (attempt $i/$attempts)"
      return 0
    fi
    sleep 3
  done

  echo "  $host: SSH still unreachable after 60s"
  return 1
}

# --- SSH tunnel helpers for distribution ---
TUNNEL_PIDS=()

cleanup_tunnels() {
  for pid in "${TUNNEL_PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
}

# Opens a persistent SSH tunnel and sets DRIVE_UPLOAD_URL.
# Usage: open_drive_tunnel <env>
# Sets: DRIVE_UPLOAD_URL, DRIVE_API_KEY
open_drive_tunnel() {
  local env="$1"

  case "$env" in
    local)
      DRIVE_UPLOAD_URL="http://localhost:3020"
      DRIVE_API_KEY="${DRIVE_LOCAL_API_KEY:-}"
      return 0
      ;;
    dev)
      local container="ternity-drive-dev"
      local tunnel_port=13020
      DRIVE_API_KEY="${DRIVE_DEV_API_KEY:-}"
      ;;
    prod)
      local container="ternity-drive-prod"
      local tunnel_port=13021
      DRIVE_API_KEY="${DRIVE_PROD_API_KEY:-}"
      ;;
  esac

  local container_ip
  container_ip=$(ssh "${VPS_USER}@${VPS_HOST}" \
    "docker inspect --format='{{range .NetworkSettings.Networks}}{{.IPAddress}}{{\"\\n\"}}{{end}}' ${container}" \
    | grep -oE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | head -1)

  if [ -z "$container_ip" ]; then
    echo "  Error: could not resolve IP for container '$container'" >&2
    return 1
  fi

  ssh -N -L "${tunnel_port}:${container_ip}:3020" "${VPS_USER}@${VPS_HOST}" &
  local tunnel_pid=$!
  TUNNEL_PIDS+=("$tunnel_pid")

  # Health check: poll /health every 0.5s, up to 20 attempts (10s)
  local i
  for i in $(seq 1 20); do
    if curl -s "http://localhost:${tunnel_port}/health" >/dev/null 2>&1; then
      DRIVE_UPLOAD_URL="http://localhost:${tunnel_port}"
      echo "  Tunnel ready ($env → ${container_ip}:3020 via port $tunnel_port)"
      return 0
    fi
    sleep 0.5
  done

  echo "  Error: tunnel health check failed for $env" >&2
  return 1
}

close_drive_tunnel() {
  # Tunnels are cleaned up via TUNNEL_PIDS in the EXIT trap.
  # This is a no-op placeholder — the trap handles cleanup.
  :
}

# --- Log directory for parallel build output ---
BUILD_LOG_DIR=$(mktemp -d)
trap "rm -rf $BUILD_LOG_DIR; cleanup_tunnels" EXIT

# --- Group status tracking ---
STATUS_A="enabled"
STATUS_B="enabled"
STATUS_C="enabled"
STATUS_D="enabled"

# ============================================================
# VM READINESS CHECK
# ============================================================

echo "==> Checking VM readiness..."

if ! ensure_vm_ready "$LINUX_ARM64_HOST"; then
  echo "  WARNING: Skipping Group B (Linux RPM arm64)"
  STATUS_B="skipped"
fi

if ! ensure_vm_ready "$LINUX_X64_HOST"; then
  echo "  WARNING: Skipping Group C (Linux RPM x64)"
  STATUS_C="skipped"
fi

if ! ensure_vm_ready "$WIN_HOST"; then
  echo "  WARNING: Skipping Group D (Windows)"
  STATUS_D="skipped"
fi

echo ""

# ============================================================
# PARALLEL BUILD GROUPS
# ============================================================
# Group B/C/D (SSH) start in background if their VM is ready.
# Group A (local) runs in foreground.
# All groups sync before distribution.
# ============================================================

echo "==> Starting parallel builds..."
echo "    Group A: macOS + Linux deb/AppImage (local, foreground)"
echo "    Group B: Linux RPM arm64 (SSH to ${LINUX_ARM64_HOST}) — ${STATUS_B}"
echo "    Group C: Linux RPM x64 (SSH to ${LINUX_X64_HOST}) — ${STATUS_C}"
echo "    Group D: Windows arm64+x64 (SSH to ${WIN_HOST}) — ${STATUS_D}"
echo ""

# --- Group B: Linux RPM arm64 (background) ---
PID_B=""
if [ "$STATUS_B" = "enabled" ]; then
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
fi

# --- Group C: Linux RPM x64 (background) ---
PID_C=""
if [ "$STATUS_C" = "enabled" ]; then
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
fi

# --- Group D: Windows (background) ---
PID_D=""
if [ "$STATUS_D" = "enabled" ]; then
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
fi

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
STATUS_A="succeeded"
echo ""

# ============================================================
# WAIT FOR BACKGROUND GROUPS
# ============================================================

echo "==> Waiting for background builds..."

for GROUP_INFO in "B:${PID_B}:group-b:RPM arm64:STATUS_B" "C:${PID_C}:group-c:RPM x64:STATUS_C" "D:${PID_D}:group-d:Windows:STATUS_D"; do
  GROUP_LABEL="${GROUP_INFO%%:*}"
  REST="${GROUP_INFO#*:}"
  GROUP_PID="${REST%%:*}"
  REST="${REST#*:}"
  GROUP_LOG="${REST%%:*}"
  REST="${REST#*:}"
  GROUP_DESC="${REST%%:*}"
  STATUS_VAR="${REST#*:}"

  CURRENT_STATUS="${!STATUS_VAR}"
  if [ "$CURRENT_STATUS" = "skipped" ]; then
    echo "  [${GROUP_LABEL}] ${GROUP_DESC} — SKIPPED"
    continue
  fi

  if wait "$GROUP_PID"; then
    echo "  [${GROUP_LABEL}] ${GROUP_DESC} — OK"
    eval "$STATUS_VAR=succeeded"
  else
    echo "  [${GROUP_LABEL}] ${GROUP_DESC} — FAILED"
    echo "  --- Log (${GROUP_LOG}) ---"
    cat "$BUILD_LOG_DIR/${GROUP_LOG}.log"
    echo "  --- End log ---"
    eval "$STATUS_VAR=failed"
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

# ============================================================
# COLLECT ARTIFACTS
# ============================================================

# Map artifact filename pattern → source group
artifact_group() {
  local name="$1"
  case "$name" in
    *.dmg|*.AppImage|*.deb) echo "A" ;;
    *arm64.rpm)             echo "B" ;;
    *x64.rpm)               echo "C" ;;
    *.exe)                  echo "D" ;;
    *)                      echo "A" ;;
  esac
}

# Map group letter → status variable value
group_status() {
  case "$1" in
    A) echo "$STATUS_A" ;;
    B) echo "$STATUS_B" ;;
    C) echo "$STATUS_C" ;;
    D) echo "$STATUS_D" ;;
  esac
}

ALL_ARTIFACTS=()
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
  ALL_ARTIFACTS+=("$file")
done

# --- Verify artifacts, accounting for skipped/failed groups ---
echo ""
echo "=== Artifacts ==="
DIST_ARTIFACTS=()
HAS_FAILED=false
for a in "${ALL_ARTIFACTS[@]}"; do
  BASENAME=$(basename "$a")
  GROUP=$(artifact_group "$BASENAME")
  GSTATUS=$(group_status "$GROUP")

  if [ -f "$a" ]; then
    echo "  $(basename "$a")  ($(du -sh "$a" | cut -f1))"
    DIST_ARTIFACTS+=("$a")
  elif [ "$GSTATUS" = "skipped" ]; then
    echo "  SKIPPED: $(basename "$a")  (Group $GROUP skipped)"
  elif [ "$GSTATUS" = "failed" ]; then
    echo "  FAILED:  $(basename "$a")  (Group $GROUP failed)"
    HAS_FAILED=true
  else
    echo "  MISSING: $(basename "$a")"
    HAS_FAILED=true
  fi
done

echo ""
echo "  Available: ${#DIST_ARTIFACTS[@]} / ${#ALL_ARTIFACTS[@]}"

if [ "$HAS_FAILED" = true ]; then
  echo ""
  echo "Error: one or more build groups failed. Aborting distribution." >&2
  exit 1
fi

if [ ${#DIST_ARTIFACTS[@]} -eq 0 ]; then
  echo ""
  echo "Error: no artifacts to distribute." >&2
  exit 1
fi

# ============================================================
# DISTRIBUTE
# ============================================================

echo ""
for ENV in "${ENVS[@]}"; do
  echo "=== Distributing to $ENV ==="

  if ! open_drive_tunnel "$ENV"; then
    echo "  ERROR: Failed to open tunnel for $ENV — skipping"
    continue
  fi

  for a in "${DIST_ARTIFACTS[@]}"; do
    echo "  -> $(basename "$a")"
    DRIVE_UPLOAD_URL="$DRIVE_UPLOAD_URL" "$SCRIPT_DIR/distribute.sh" "$a" "$ENV"
    echo ""
  done

  # --- Push release notes through the same tunnel ---
  if [ -n "$NOTES" ]; then
    echo "  Release notes (v${VERSION})..."
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
      -X PUT "${DRIVE_UPLOAD_URL}/api/releases/${VERSION}/notes" \
      -H "Authorization: Bearer $DRIVE_API_KEY" \
      -H "Content-Type: text/markdown" \
      -d "$NOTES")

    if [ "$HTTP_CODE" = "200" ]; then
      echo "  Release notes: OK"
    else
      echo "  Release notes: FAILED (HTTP $HTTP_CODE)"
    fi
  fi

  close_drive_tunnel
  echo ""
done

# ============================================================
# SUMMARY
# ============================================================

echo "=== Done ==="
echo "  Version:      v${VERSION}"
echo "  Artifacts:    ${#DIST_ARTIFACTS[@]} / ${#ALL_ARTIFACTS[@]}"
echo "  Groups:       A=$STATUS_A  B=$STATUS_B  C=$STATUS_C  D=$STATUS_D"
echo "  Notes:        $([ -n "$NOTES" ] && echo "pushed" || echo "none")"
echo "  Environments: ${ENVS[*]}"
