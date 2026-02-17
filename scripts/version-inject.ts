/**
 * Inject git version into package.json before build.
 *
 * Source of truth: `git describe --tags --always`
 * - Tagged commit: `v0.1.0`
 * - Untagged commit: `v0.1.0-3-gabc123f`
 * - No tags at all: short commit hash `abc123f`
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const projectRoot = join(import.meta.dirname, '..');
const pkgPath = join(projectRoot, 'package.json');

const gitVersion = execSync('git describe --tags --always', { cwd: projectRoot })
  .toString()
  .trim()
  .replace(/^v/, ''); // strip leading 'v' for package.json semver

const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
const oldVersion = pkg.version;
pkg.version = gitVersion;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');

console.log(`Version: ${oldVersion} → ${gitVersion}`);
