#!/usr/bin/env bash
#
# Build a branded DMG with custom background and icon layout.
#
# Uses hdiutil + osascript (AppleScript) — no native npm modules needed.
# Runs after electron-builder produces the .app bundle (target: dir).
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$PROJECT_ROOT/dist"
RESOURCES_DIR="$PROJECT_ROOT/resources"

# --- Find the .app bundle ---
APP_PATH=""
for dir in mac-arm64 mac-x64 mac; do
  candidate="$DIST_DIR/$dir"
  if [ -d "$candidate" ]; then
    app=$(find "$candidate" -maxdepth 1 -name "*.app" -type d | head -1)
    if [ -n "$app" ]; then
      APP_PATH="$app"
      break
    fi
  fi
done

if [ -z "$APP_PATH" ]; then
  echo "Error: No .app bundle found in dist/. Run electron-builder first."
  exit 1
fi

APP_NAME=$(basename "$APP_PATH")

# --- Version + output name ---
VERSION=$(node -e "console.log(require('./package.json').version)")
ARCH=$([[ "$APP_PATH" == *arm64* ]] && echo "arm64" || echo "x64")
DMG_NAME="Ternity-${VERSION}-${ARCH}.dmg"
DMG_PATH="$DIST_DIR/$DMG_NAME"
VOLUME_NAME="Ternity Desktop"

# --- Config ---
BG_IMAGE="$RESOURCES_DIR/dmg-background.png"
ICON_FILE="$RESOURCES_DIR/icon.icns"
WINDOW_WIDTH=660
WINDOW_HEIGHT=400
ICON_SIZE=80

echo "Building DMG: $DMG_NAME"
echo "  App: $APP_PATH"
echo "  Background: $BG_IMAGE"

# --- Clean up any previous artifacts ---
[ -f "$DMG_PATH" ] && rm "$DMG_PATH"
TEMP_DMG="$DIST_DIR/_temp.dmg"
[ -f "$TEMP_DMG" ] && rm "$TEMP_DMG"

# Eject if already mounted
hdiutil detach "/Volumes/$VOLUME_NAME" 2>/dev/null || true

# --- Create temp read-write DMG ---
# Size: app size + 20MB headroom
APP_SIZE_KB=$(du -sk "$APP_PATH" | cut -f1)
DMG_SIZE_KB=$((APP_SIZE_KB + 20480))

hdiutil create \
  -size "${DMG_SIZE_KB}k" \
  -fs HFS+ \
  -volname "$VOLUME_NAME" \
  -type SPARSE \
  "$TEMP_DMG"

# Mount it
MOUNT_OUTPUT=$(hdiutil attach "${TEMP_DMG}.sparseimage" -readwrite -noverify -noautoopen)
DEVICE=$(echo "$MOUNT_OUTPUT" | grep "/dev/" | head -1 | awk '{print $1}')
MOUNT_POINT="/Volumes/$VOLUME_NAME"

echo "  Mounted at: $MOUNT_POINT ($DEVICE)"

# --- Copy contents ---
cp -R "$APP_PATH" "$MOUNT_POINT/"
ln -s /Applications "$MOUNT_POINT/Applications"

# --- Set background + icon layout via AppleScript ---
mkdir -p "$MOUNT_POINT/.background"
cp "$BG_IMAGE" "$MOUNT_POINT/.background/background.png"

# Set volume icon
cp "$ICON_FILE" "$MOUNT_POINT/.VolumeIcon.icns"
SetFile -c icnC "$MOUNT_POINT/.VolumeIcon.icns" 2>/dev/null || true
SetFile -a C "$MOUNT_POINT" 2>/dev/null || true

osascript <<APPLESCRIPT
tell application "Finder"
  tell disk "$VOLUME_NAME"
    open
    set current view of container window to icon view
    set toolbar visible of container window to false
    set statusbar visible of container window to false
    set the bounds of container window to {100, 100, $((100 + WINDOW_WIDTH)), $((100 + WINDOW_HEIGHT))}
    set theViewOptions to the icon view options of container window
    set arrangement of theViewOptions to not arranged
    set icon size of theViewOptions to $ICON_SIZE
    set background picture of theViewOptions to file ".background:background.png"
    set position of item "$APP_NAME" of container window to {180, 280}
    set position of item "Applications" of container window to {480, 280}
    close
    open
    update without registering applications
    delay 2
    close
  end tell
end tell
APPLESCRIPT

echo "  AppleScript layout applied"

# --- Finalize ---
sync
hdiutil detach "$DEVICE"

# Convert to compressed read-only DMG
hdiutil convert "${TEMP_DMG}.sparseimage" \
  -format UDZO \
  -imagekey zlib-level=9 \
  -o "$DMG_PATH"

# Clean up
rm -f "${TEMP_DMG}.sparseimage"

# --- Sign the DMG ---
SIGNING_IDENTITY="Developer ID Application: NETBULLS S C (9374FZ3B8X)"
echo "  Signing DMG..."
codesign --sign "$SIGNING_IDENTITY" "$DMG_PATH"
codesign --verify --verbose "$DMG_PATH"
echo "  DMG signed"

# --- Notarize the DMG (if credentials available) ---
if [ -n "${APPLE_ID:-}" ] && [ -n "${APPLE_APP_SPECIFIC_PASSWORD:-}" ] && [ -n "${APPLE_TEAM_ID:-}" ]; then
  echo "  Submitting DMG for notarization..."
  xcrun notarytool submit "$DMG_PATH" \
    --apple-id "$APPLE_ID" \
    --password "$APPLE_APP_SPECIFIC_PASSWORD" \
    --team-id "$APPLE_TEAM_ID" \
    --wait
  echo "  Stapling notarization ticket..."
  xcrun stapler staple "$DMG_PATH"
  echo "  DMG notarized and stapled"
else
  echo "  Skipping notarization (APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID not set)"
fi

echo ""
echo "DMG created: dist/$DMG_NAME"
echo "  Size: $(du -sh "$DMG_PATH" | cut -f1)"
