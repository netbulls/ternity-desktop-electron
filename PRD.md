# PRD — Ternity Desktop

## Problem Statement

The main Ternity web app is full-featured but heavy for the most frequent action — starting and stopping a timer. Users have to open a browser, navigate to the tab, and interact with the full UI just to toggle a timer or check how long they've been working. This breaks flow, especially when switching between tasks throughout the day.

## Solution

A lightweight system tray companion app that gives instant access to time tracking controls. Click the tray icon, see your running timer and today's stats in a compact overlay, start/stop with one click. No browser needed, always accessible, beautiful and fast.

## User Personas

### Employee (primary)
- Starts and stops timers dozens of times a day
- Wants to glance at how long current task has been running without context-switching
- Needs to pick a project quickly when starting a new timer
- Wants to see today's total at a glance

## Core Workflows

### 1. Start a Timer
1. Click tray icon → overlay appears
2. Type task description (or leave blank)
3. Pick project from dropdown (recent projects first)
4. Click Start → timer begins, overlay can be dismissed
5. Tray icon updates to show timer is running

### 2. Stop a Timer
1. Click tray icon → overlay shows running timer with elapsed time
2. Click Stop → timer stops, entry saved
3. Today's stats update immediately

### 3. Glance at Status
1. Hover tray icon → tooltip shows "Running: 1h 23m" or "No timer"
2. Click tray icon → see today's total, this week's total, last few entries

### 4. Quick Review
1. See 3-5 most recent entries in the overlay
2. Each shows: description, project, duration
3. Click "Open Ternity" to go to the full web app for editing

## UI Concept

Compact overlay popup (~340px wide), appears anchored to the tray icon:

```
┌──────────────────────────────────┐
│  ⏳ TERNITY               [gear] │
├──────────────────────────────────┤
│                                  │
│  What are you working on?        │
│  [Project ▾]        0:00:00     │
│                     [▶ Start]    │
│                                  │
├──────────────────────────────────┤
│  Today          This Week        │
│  3h 45m         18h 30m          │
├──────────────────────────────────┤
│  Recent                          │
│  ● Fix login bug          45m   │
│  ● Team standup         1h 15m   │
│  ● Design review        2h 00m   │
├──────────────────────────────────┤
│  Open Ternity ↗                  │
└──────────────────────────────────┘
```

When a timer is running, the top section transforms:

```
├──────────────────────────────────┤
│                                  │
│  Fix login bug                   │
│  Acme Corp · Website    1:23:45  │
│                     [■ Stop]     │
│                                  │
├──────────────────────────────────┤
```

Design principles:
- Uses Ternity brand: dark theme (#0a0a0a bg), Electric Teal (#00D4AA) accents, Oxanium font
- Compact — no wasted space, every pixel earns its place
- Smooth but not over-animated — subtle transitions, no heavy effects
- Tray icon reflects state (idle vs running)

## Non-Goals (v1)

- Full entry editing (use the web app)
- Leave management (use the web app)
- Reports, charts, calendar (use the web app)
- Label selection (keep it simple — project only)
- Admin or org settings
- Offline mode / local queue
- Multiple simultaneous timers
- Notifications / reminders

## External Dependencies

- **Ternity API** — the desktop app is a thin client; all data lives on the server
- **Auth** — needs to authenticate against the same Logto instance as the web app (device flow or token from web login)
