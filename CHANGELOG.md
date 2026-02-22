# Changelog

## [Unreleased]

## [0.5.0] - 2026-02-22

### Added
- Wide timer variant for Liquid Glass layout — full-width Start/Stop button below project pill
- Timer Style setting in Appearance — choose between Default and Liquid Glass Wide (only available for Liquid Glass layout)
- Show incomplete entry indicator on running entries in the entries list
- Sort entries within each day by creation date (newest first)
- Redesign login view — polished layout with full-width sign-in button, env selector moved to footer
- Branded browser pages for sign-in success, sign-in error, and sign-out with Ternity logo and Oxanium font
- Browser sign-out flow — sign out opens branded page with optional "Sign out of browser" to end Logto session
- Auto-show popup after successful OAuth sign-in
- Hide popup during sign-in and sign-out flows to avoid overlaying browser
- Header branding — "Electron" suffix after TERNITY, environment warning strip for local/dev
- Windows installer code signing — shows "Open Source Developer, Przemyslaw Rudzki" instead of "Unknown Publisher"
- Frosted glass day headers and footer overlay with gradual fade effect
- Breathing border animation on project pill when picker is open
- Pill-pop animation on project selection (green flash)
- LiquidEdge — drifting teal blobs when timer is running
- Glassy frosted project picker with blur and inner highlight
- Mutation error banner with retry action for failed API calls
- Error boundary with recovery UI — prevents white screen on unexpected crashes
- RPM packages for Linux (Fedora, RHEL)

### Fixed
- Fix Windows window drag — title bar click dismissed the window instead of allowing move

### Changed
- Force fresh login on every sign-in (`prompt: 'login consent'`) — no more auto-sign-in from stale browser sessions
- Migrate to segments-based entry model — elapsed time computed from segments, durations from `totalDurationSeconds`

## [0.4.0] - 2026-02-20

### Added
- Inline editing — edit entry descriptions and projects directly in the entries list
- Default project preference — pre-selects in timer form, persists across sessions
- Click-outside to dismiss popup on macOS (previously only via Escape or tray toggle)
- Windows dark/light tray icons — auto-switch based on taskbar theme
- User-resizable window height (400–1200px), persisted across sessions

### Fixed
- Project picker dropdown positioning — was off-screen due to CSS calc strings used in JS arithmetic
- Windows Aero Snap causing vertical maximize during manual resize (set maximizable: false)
- Windows settings panel toggle causing width overshoot/shrink (programmaticResize guard)
- Linux window position not restored — save position on hide/close since moved event never fires on Wayland

### Changed
- macOS blur handling uses space-change detection to survive space switches while allowing click-outside dismiss

## [0.3.0] - 2026-02-19

### Added
- Full-matrix release script — build all platforms and architectures in one command
- Changelog convention with release notes pushed to Drive

### Fixed
- macOS window stays pinned across spaces with keyboard focus
- Release script Linux artifact discovery (platform-native arch naming)

### Changed
- Enlarge tray icon to fill more of the menubar canvas

## [0.2.1] - 2026-02-19

### Added
- Cross-platform "Remember Position" toggle — window reopens at last dragged position

### Fixed
- Eliminate initial launch resize jank — window appears fully formed

## [0.2.0] - 2026-02-18

### Added
- Linux support — AppImage and deb packages for arm64 and x64
- Multi-platform builds and Drive distribution pipeline
- DMG custom icon and build script improvements

### Fixed
- Linux tray icon, window positioning, and resize behavior
- Project picker search: prioritize name matches over client matches

## [0.1.0] - 2026-02-17

### Added
- Ternity Desktop — system tray companion for time tracking
- PKCE authentication with Ternity API
- Timer controls, today's stats, and recent entries
- Liquid Glass layout with live editing and layout picker
- macOS code signing and notarization
- Tray behaviors, compact settings, and structured logging

### Fixed
- Auth refresh tokens and popup behavior on macOS Spaces
- App icon centering and branded DMG packaging
