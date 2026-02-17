<!-- rule-version: 1.0 -->
# Versioning

## Source of Truth

Git tags using semver (`v1.2.3`). Native stack files (package.json, pubspec.yaml, etc.) are not the source of truth — they get version injected at build time from git.

- **Tagged** (release): clean semver tag → `v1.3.0`. An organizational/team decision, not an individual developer action.
- **Untagged** (in-progress): derived from `git describe --tags` → `v1.2.0-5-gabc123f` (5 commits after v1.2.0). Every untagged build is uniquely identified and traceable to an exact commit.
- **Uncommitted**: local development. No version needed.

## Build Identity

Every build from committed code must be stamped with the full `git describe --tags --always` output, including the commit hash (e.g., `v1.2.0-5-gabc123f`). The commit hash is what guarantees uniqueness — the count alone is not unique across branches. Tagged builds get the clean tag (e.g., `v1.3.0`). This applies to all builds, whether or not they are deployed.

## Rules

- Commit messages: imperative mood, concise (e.g., "Add user authentication flow")
- Create commits only when the user requests it
- Tagging is deliberate: only tag when explicitly asked (e.g., "release this as v1.3.0")
