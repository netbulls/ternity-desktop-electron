<!-- rule-version: 1.0 -->
# Stack

## Tech Stack

- **Platform:** Electron (cross-platform desktop — macOS, Windows, Linux)
- **Frontend:** React 19 + TypeScript + Vite
- **UI:** Tailwind CSS (shared brand tokens from Ternity)
- **Font:** Oxanium (Google Fonts)
- **Package manager:** pnpm
- **Packaging:** electron-builder (dmg, exe/nsis, AppImage/deb)
- **Code signing:** macOS via Apple Developer ID (sign + notarize), Windows TBD
- **Audience:** Internal team (~75 users)

## Version Injection

`git describe --tags --always` → injected into `package.json` version field at build time via a prebuild script.

## Workflow

### Checks

| Item | Command |
|---|---|
| **format** | `pnpm prettier --write .` |
| **type-check** | `pnpm tsc --noEmit` |

### Actions

| Item | Command |
|---|---|
| **build** | `pnpm electron-builder --config electron-builder.yml` |
| **release** | `source .env.signing && ./scripts/release.sh <env...>` |
| **distribute** | `source .env.signing && ./scripts/distribute.sh <file> <env>` |

### Release (full matrix)

`./scripts/release.sh` builds all platforms and architectures, then distributes to the specified environments. Always produces 6 artifacts:

| Platform | arm64 | x64 |
|---|---|---|
| **macOS** | `.dmg` (signed + notarized) | `.dmg` (signed + notarized) |
| **Linux** | `.AppImage` + `.deb` | `.AppImage` + `.deb` |

## Environments

| | local | dev | prod |
|---|---|---|---|
| **config** | `.env.local` | `.env.dev` | `.env.production` |
| **build mode** | debug | debug | release |
| **API URL** | `http://localhost:3000` | TBD (remote VPS) | TBD (remote VPS) |
| **build** | `pnpm build:local` | `pnpm build:dev` | `pnpm build:prod` |
| **signing** | unsigned | unsigned | signed + notarized (macOS) |
