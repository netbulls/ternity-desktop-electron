# Ternity Dev Watcher
#
# Runs on the Windows desktop session. Watches for a reload signal
# from macOS (touch dev-reload), then kills the running app, syncs
# source from the Parallels shared folder, and restarts pnpm dev.
#
# Usage: double-click dev-watcher.cmd on Windows Desktop, or let it
# auto-start via the Startup folder shortcut.
#
# Signal from macOS: ./scripts/test-windows.sh

$localDir   = "C:\Users\erace\ternity-desktop"
$sharedDir  = "\\Mac\Home\Projects\netbulls.ternity.desktop"
$triggerFile = "$sharedDir\dev-reload"

$Host.UI.RawUI.WindowTitle = "Ternity Dev Watcher"

function Write-Log($msg) {
    Write-Host "$(Get-Date -Format 'HH:mm:ss') $msg"
}

Write-Log "Ternity Dev Watcher started"
Write-Log "Watching: $triggerFile"
Write-Log "Trigger:  ./scripts/test-windows.sh (on macOS)"
Write-Log ""

$lastReload = if (Test-Path $triggerFile) {
    (Get-Item $triggerFile).LastWriteTime
} else {
    [DateTime]::MinValue
}

$devProc = $null

while ($true) {
    Start-Sleep -Milliseconds 500

    if (-not (Test-Path $triggerFile)) { continue }

    $current = (Get-Item $triggerFile).LastWriteTime
    if ($current -le $lastReload) { continue }
    $lastReload = $current

    Write-Log "--- Reload signal detected ---"

    # Kill previous dev process (the cmd window running pnpm dev)
    if ($devProc -and -not $devProc.HasExited) {
        Write-Log "Stopping previous dev session (PID $($devProc.Id))..."
        taskkill /T /F /PID $devProc.Id 2>$null
        Start-Sleep 1
    }

    # Kill any remaining Electron processes
    Get-Process -Name "ternity-desktop", "electron" -ErrorAction SilentlyContinue |
        Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep 1

    # Sync source files from macOS shared folder
    Write-Log "Syncing source..."
    robocopy "$sharedDir\src" "$localDir\src" /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
    Copy-Item "$sharedDir\package.json" "$localDir\package.json" -Force

    # Start dev mode in a new cmd window
    Write-Log "Starting pnpm dev..."
    $devProc = Start-Process cmd -ArgumentList "/k",
        "title TernityDev && cd /d $localDir && set PATH=C:\Program Files\nodejs;C:\Users\erace\AppData\Roaming\npm;C:\Program Files\Git\bin;%PATH% && pnpm dev" `
        -PassThru

    Write-Log "Dev mode started (PID $($devProc.Id))"
    Write-Log ""
}
