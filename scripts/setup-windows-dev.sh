#!/usr/bin/env bash
#
# One-time setup: install dev-watcher auto-start on Windows VM.
#
# Creates a .cmd launcher on the Windows Desktop (for manual start)
# and a .vbs wrapper in the Startup folder (for auto-start on login).
#
# After running this script, either:
#   - Reboot the Windows VM (watcher starts automatically), or
#   - Double-click "TernityDevWatcher.cmd" on the Windows Desktop
#
# Usage:
#   ./scripts/setup-windows-dev.sh
#

set -euo pipefail

WIN_HOST="windows-arm64"
WIN_USER="erace"
SHARED='\\Mac\Home\Projects\netbulls.ternity.desktop'
STARTUP="C:\\Users\\${WIN_USER}\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup"
DESKTOP="C:\\Users\\${WIN_USER}\\Desktop"

echo "Setting up Ternity Dev Watcher on Windows VM..."

# Create desktop launcher (.cmd) — for manual start
ssh "$WIN_HOST" "
(
echo @echo off
echo title Ternity Dev Watcher
echo powershell -ExecutionPolicy Bypass -File \"${SHARED}\\scripts\\dev-watcher.ps1\"
echo pause
) > \"${DESKTOP}\\TernityDevWatcher.cmd\"
"
echo "  Created: Desktop\\TernityDevWatcher.cmd"

# Create startup launcher (.vbs) — auto-start on login, visible window
ssh "$WIN_HOST" "
(
echo Set WshShell = CreateObject^(\"WScript.Shell\"^)
echo WshShell.Run \"powershell -ExecutionPolicy Bypass -File \"\"${SHARED}\\scripts\\dev-watcher.ps1\"\"\", 1, False
) > \"${STARTUP}\\TernityDevWatcher.vbs\"
"
echo "  Created: Startup\\TernityDevWatcher.vbs"

echo ""
echo "Done! To start the watcher now:"
echo "  Double-click TernityDevWatcher.cmd on the Windows Desktop"
echo ""
echo "It will auto-start on future logins via the Startup folder."
echo ""
echo "Then from macOS, just run:"
echo "  ./scripts/test-windows.sh"
