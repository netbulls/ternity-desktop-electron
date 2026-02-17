import { app } from 'electron';
import { join } from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';

export function getConfigPath(): string {
  return join(app.getPath('userData'), 'config.json');
}

export function readConfig(): Record<string, unknown> {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) return {};
  try {
    return JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch {
    return {};
  }
}

export function writeConfig(config: Record<string, unknown>): void {
  writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), 'utf-8');
}
