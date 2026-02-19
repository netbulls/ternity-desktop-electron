<!-- rule-version: 1.0 -->
# Changelog

## Format

`CHANGELOG.md` in the project root, following [Keep a Changelog](https://keepachangelog.com).

```markdown
# Changelog

## [Unreleased]

### Added
- New feature description

## [0.2.1] - 2026-02-15

### Fixed
- Bug description
```

## Categories

Closed set — only use what applies, never add empty sections:

| Category | What it covers |
|---|---|
| **Added** | New features or capabilities |
| **Changed** | Changes to existing functionality |
| **Deprecated** | Features marked for future removal |
| **Removed** | Features removed in this release |
| **Fixed** | Bug fixes |
| **Security** | Vulnerability fixes |

## When to Update

**At commit time.** When creating a commit, if the change is user-facing (new feature, bug fix, behavior change), add an entry to the `[Unreleased]` section of CHANGELOG.md. Include it in the same commit.

Skip changelog entries for:
- Internal refactors with no user-visible effect
- Build script changes, CI config, developer tooling
- Documentation-only changes
- Code style / formatting fixes

## At Release Time

When tagging a release:
1. Rename `[Unreleased]` to `[x.y.z] - YYYY-MM-DD`
2. Add a fresh empty `[Unreleased]` section above it
3. Commit the changelog update as part of the release

Release scripts may automate this and extract the current version's notes for distribution (e.g., upload to artifact stores, post to Slack).

## Rules

- One changelog per project — always at the root as `CHANGELOG.md`
- Entries are concise, imperative mood (e.g., "Add dark mode toggle", not "Added dark mode toggle")
- Group related changes into a single entry when appropriate
- Never remove or rewrite published entries (released versions are immutable)
- `[Unreleased]` is always the first section after the heading
