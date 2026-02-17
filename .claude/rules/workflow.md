<!-- rule-version: 1.0 -->
# Workflow

## Closed Catalog of Actions

Only these actions exist. Projects pick which ones apply.

### Checks (validate code quality, run anytime)

| Item | What it does |
|---|---|
| **format** | Auto-fix code style |
| **lint** | Static code quality rules |
| **type-check** | Type correctness |
| **test** | Run tests |

### Actions (build and deliver, parameterized by environment)

| Item | Per-env? | What it does |
|---|---|---|
| **build** | yes | Build for a target environment, stamped with version from git |
| **deploy** | yes | Deploy to a target environment |
| **publish** | no | Publish to a registry (npm, pub.dev) — tagged only |
| **distribute** | yes | Send to testers/stores (TestFlight, Play Store) |
| **archive** | no | Create release artifact (zip, GitHub release) |

### Version Actions

| Item | What it does |
|---|---|
| **tag** | Promote current code to a release (`git tag v1.3.0`) |
| **version-inject** | Write version (from git) into native stack files at build time |
