#!/bin/bash
# Fix chrome-sandbox SUID bit for Electron on Linux
chmod 4755 /opt/Ternity/chrome-sandbox 2>/dev/null || true
