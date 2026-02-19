# Features

Append-only feature log. Each entry is a self-contained spec — enough for another project to implement the same behavior without needing to read the source code.

Reference from other projects: `~/Projects/netbulls.ternity.desktop/FEATURES.md`

---

## TDE-1 — Default Project Preference
**Added:** 2026-02-19

### Behavior
- User picks a default project in Settings via a project picker (searchable dropdown with client grouping and color indicators)
- Timer form pre-selects the default project when idle — on app load and after stopping a timer
- Starting a timer with no manual override uses the default project
- Manually picking a different project overrides the default for that session only
- Changing the default in settings immediately updates the idle timer form (live sync)
- Setting default to "None" clears it — timer starts with no project
- If the saved default project no longer exists in the project list, it's treated as "None"

### Decisions
- Stored as `defaultProjectId` in local config (not server-side) — this is a per-device preference
- Settings panel fetches the project list independently from the API (it doesn't share state with the timer's data provider)
- Live sync between settings and timer form uses a DOM custom event (`default-project-changed`)
- The project picker in settings reuses the same component as the timer's picker, with right-alignment so it overlays both panels

### Reference
- Config IPC: `src/main/index.ts`
- Settings UI: `src/renderer/src/components/settings-content.tsx`
- Timer integration: `src/renderer/src/components/tray-popup.tsx`
- Project picker: `src/renderer/src/components/project-picker.tsx` (`align` prop)

---

## TDE-2 — Click-Outside to Dismiss with Space Switch Survival (macOS)
**Added:** 2026-02-19

### Behavior
- Clicking outside the popup window dismisses (hides) it
- Switching macOS spaces keeps the popup visible — it re-focuses after the space transition
- Escape key and tray icon toggle still dismiss as before
- On Linux/Windows: click outside always dismisses (unchanged)

### Decisions
- The challenge: both "click outside" and "space switch" trigger a window blur event on macOS — no built-in way to distinguish them
- Failed approach: `app.on('did-resign-active')` fires for both cases — unreliable
- Working approach: subscribe to `NSWorkspaceActiveSpaceDidChangeNotification` via `systemPreferences.subscribeWorkspaceNotification()`. This fires only on actual space changes. The handler records a timestamp. On blur, if a space change happened within the last 1 second, re-focus the window (space switch). Otherwise, hide it (click outside)
- The window uses `visibleOnAllWorkspaces: true` and `alwaysOnTop: 'floating'` (type `'panel'`) so it appears across all spaces including full-screen ones

### Reference
- Blur handling + space detection: `src/main/index.ts` (blur handler in `createPopup`, workspace notification subscription after `app.whenReady`)
