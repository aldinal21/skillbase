import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AppConfig } from '../types.js';

export function DEFAULT_CONFIG_PATH(): string {
  return path.join(os.homedir(), '.skillbase', 'config.json');
}

export function defaultConfig(vaultPath = '~/.skillbase/vault'): AppConfig {
  return { version: 1, vaultPath, targets: [], updateCheck: { intervalHours: 24, lastCheck: null } };
}

export function expandHome(p: string): string {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/') || p.startsWith('~\\')) return path.join(os.homedir(), p.slice(2));
  return p;
}

export async function loadConfig(configPath = DEFAULT_CONFIG_PATH()): Promise<AppConfig | null> {
  try {
    return JSON.parse(await fs.readFile(configPath, 'utf8')) as AppConfig;
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') return null;
    throw e;
  }
}

export async function saveConfig(cfg: AppConfig, configPath = DEFAULT_CONFIG_PATH()): Promise<void> {
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
}
