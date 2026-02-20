# Changelog

## [Unreleased]

### Added
- Windows installer code signing — shows "Open Source Developer, Przemyslaw Rudzki" instead of "Unknown Publisher"

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
