/**
 * Build a branded DMG using appdmg.
 *
 * electron-builder on arm64 creates APFS DMGs which don't support custom
 * backgrounds. This script uses appdmg to create an HFS+ DMG with full
 * background/icon-layout support.
 *
 * Prerequisites: electron-builder must have already produced the .app bundle
 * in dist/mac-arm64/ (via `electron-builder --mac --config ... -c.mac.target=dir`).
 */

import { execSync } from 'child_process';
import { existsSync, readdirSync, writeFileSync, unlinkSync } from 'fs';
import { join, resolve } from 'path';

const projectRoot = join(import.meta.dirname, '..');
const distDir = join(projectRoot, 'dist');

// Find the .app bundle — electron-builder puts it in dist/mac-arm64/ or dist/mac/
const macDirs = ['mac-arm64', 'mac-x64', 'mac'];
let appPath: string | undefined;

for (const dir of macDirs) {
  const candidate = join(distDir, dir);
  if (existsSync(candidate)) {
    const apps = readdirSync(candidate).filter((f) => f.endsWith('.app'));
    if (apps.length > 0) {
      appPath = join(candidate, apps[0]);
      break;
    }
  }
}

if (!appPath) {
  console.error('No .app bundle found in dist/. Run electron-builder first.');
  process.exit(1);
}

// Read version from package.json for the output filename
const pkg = JSON.parse(
  execSync('cat package.json', { cwd: projectRoot }).toString()
);
const version = pkg.version;
const arch = appPath.includes('arm64') ? 'arm64' : 'x64';
const dmgName = `Ternity-${version}-${arch}.dmg`;
const dmgPath = join(distDir, dmgName);

// Remove existing DMG if present
if (existsSync(dmgPath)) {
  unlinkSync(dmgPath);
}

// appdmg config
const appdmgConfig = {
  title: 'Ternity Desktop',
  icon: resolve(projectRoot, 'resources/icon.icns'),
  background: resolve(projectRoot, 'resources/dmg-background.png'),
  'background-color': '#0a0a0a',
  'icon-size': 80,
  window: {
    size: {
      width: 660,
      height: 400
    }
  },
  contents: [
    { x: 180, y: 310, type: 'file', path: resolve(appPath) },
    { x: 480, y: 310, type: 'link', path: '/Applications' }
  ]
};

const configPath = join(distDir, 'appdmg-config.json');
writeFileSync(configPath, JSON.stringify(appdmgConfig, null, 2));

console.log(`Building DMG: ${dmgName}`);
console.log(`  App: ${appPath}`);
console.log(`  Background: resources/dmg-background.png`);

try {
  execSync(`npx appdmg "${configPath}" "${dmgPath}"`, {
    cwd: projectRoot,
    stdio: 'inherit'
  });
  console.log(`\nDMG created: dist/${dmgName}`);
} finally {
  // Clean up temp config
  if (existsSync(configPath)) {
    unlinkSync(configPath);
  }
}
