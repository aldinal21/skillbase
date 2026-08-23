import os from 'node:os';
import path from 'node:path';
import { DEFAULT_CONFIG_PATH, defaultConfig, expandHome, loadConfig, saveConfig } from './core/config.js';
import { detectInstalledPresets, presetToTarget } from './core/targets.js';
import { GithubClient } from './core/github.js';
import { Vault } from './core/vault.js';
import type { CliIo } from './ui/io.js';
import type { AppConfig } from './types.js';

export interface CliCtx {
  cfgPath: string;
  cfg: AppConfig;
  vault: Vault;
  gh: GithubClient;
}

let cached: Promise<CliCtx> | null = null;

export async function ensureContext(io: CliIo): Promise<CliCtx> {
  cached ??= build(io);
  return cached;
}

async function build(io: CliIo): Promise<CliCtx> {
  const cfgPath = DEFAULT_CONFIG_PATH();
  let cfg = await loadConfig(cfgPath);
  if (!cfg) {
    cfg = defaultConfig();
    const installed = await detectInstalledPresets();
    if (installed.length > 0) {
      const chosen = await io
        .multiselect({
          message: 'Detected agents — which should receive skills?',
          options: installed.map((pr) => ({ value: pr.key, label: pr.name })),
        })
        .catch(() => []);
      const keys = new Set(chosen);
      cfg.targets = installed.filter((pr) => keys.has(pr.key)).map(presetToTarget);
    }
    await saveConfig(cfg, cfgPath);
    io.info(
      `Config created at ${path.join(os.homedir(), '.skillbase', 'config.json')}`,
    );
  }
  const token = process.env['GITHUB_TOKEN'] ?? process.env['GH_TOKEN'];
  const vault = new Vault(expandHome(cfg.vaultPath));
  return { cfgPath, cfg, vault, gh: new GithubClient(undefined, token) };
}
