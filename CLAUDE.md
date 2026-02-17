# CLAUDE.md

> **Do NOT run `/init` on this project** — it will overwrite these instructions.

## Project Overview

**Ternity Desktop** is a lightweight system tray companion app for [Ternity](../netbulls.ternity.sandbox) — a time tracking and leave management platform. It provides instant access to start/stop timer controls, today's stats, and recent entries without opening a browser. Cross-platform (macOS, Windows, Linux), built with Electron + React + TypeScript.

The main Ternity web app is the full-featured interface. This desktop app is the quick-access layer — always one click away from the tray icon.

## Key Design Decisions

- **Thin client** — all data lives on the Ternity API; no local database
- **Tray-first** — the app lives in the system tray, not as a traditional window
- **Brand-consistent** — same Ternity visual identity (dark theme, Electric Teal, Oxanium font)
- **Minimal scope** — timer + stats + recent entries only; everything else stays in the web app
- **Signed builds** — macOS via Apple Developer ID (sign + notarize); Windows TBD

## Critical Rules

- The desktop app must never duplicate features that belong in the web app (editing entries, leave management, reports, admin)
- All brand assets (logo, colors, fonts) come from `BRAND.md` in the sandbox project
- Theme tokens come from `THEMES.md` in the sandbox project — start with Ternity Dark only

## Shared Resources (in sandbox project)

The sandbox project (`netbulls.ternity.sandbox`) is the single source of truth for all cross-project assets. It's listed as an `additionalDirectory` in `.claude/settings.json`.

| Resource | Path (relative to sandbox root) |
|---|---|
| Brand guidelines | `BRAND.md` |
| Theme definitions | `THEMES.md` |
| Theme CSS (shadcn tokens) | `apps/web/public/explorations/themes.css` |
| All design explorations | `apps/web/public/explorations/` (served by Vite at `/explorations/`) |
| Desktop explorations | `apps/web/public/explorations/desktop/` |
| Web app explorations | `apps/web/public/explorations/web/` |
| Logo/wordmark SVGs | `assets/` |

---

Standards for Directory Boundaries, Versioning, Environments, Workflow, and Stack are in `.claude/rules/*.md` — loaded automatically, do not duplicate here.

## Global Learnings

Cross-project learnings are stored at: `$CLAUDE_PROJECTS_HOME/LEARNINGS.md`

When the user says something is worth adding to global learnings, append it to that file with the project name and date. Always confirm with the user before writing.
