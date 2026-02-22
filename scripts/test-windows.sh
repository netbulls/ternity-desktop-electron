#!/usr/bin/env bash
#
# Trigger a dev reload on the Windows VM.
#
# Touches dev-reload in the project root; the dev-watcher.ps1 script
# running on the Windows desktop picks it up via the Parallels shared
# folder (\\Mac\Home\...), syncs source, and restarts pnpm dev.
#
# First-time setup:
#   ./scripts/setup-windows-dev.sh
#
# Usage:
#   ./scripts/test-windows.sh
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Touch the trigger file — the shared folder makes it instantly
# visible to the Windows watcher without any SSH call.
touch "$PROJECT_DIR/dev-reload"

echo "Reload signal sent — Windows VM will sync and restart."
