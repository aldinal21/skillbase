import os from 'node:os';
import path from 'node:path';
import { DEFAULT_CONFIG_PATH, defaultConfig, expandHome, loadConfig, saveConfig } from './core/config.js';
import { detectInstalledPresets, presetToTarget } from './core/targets.js';
import { findUnmanaged } from './core/scanner.js';
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
  const interactive = Boolean(process.stdin.isTTY);
  let cfg = await loadConfig(cfgPath);
  if (!cfg) {
    cfg = defaultConfig();
    const installed = interactive ? await detectInstalledPresets() : [];
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
    if (!interactive) {
      io.info(`Config created at ${cfgPath} — run 'skillbase targets' to add deploy targets`);
    } else {
      io.info(`Config created at ${path.join(os.homedir(), '.skillbase', 'config.json')}`);
    }
  }
  const token = process.env['GITHUB_TOKEN'] ?? process.env['GH_TOKEN'];
  const vault = new Vault(expandHome(cfg.vaultPath));
  const ctx: CliCtx = { cfgPath, cfg, vault, gh: new GithubClient(undefined, token) };

  // First run with chosen targets: offer one-shot migration of existing skills.
  if (interactive && cfg.targets.length > 0) {
    try {
      const found = await findUnmanaged(vault, cfg.targets);
      if (found.length > 0) {
        const ok = await io
          .confirm({
            message: `Found ${found.length} existing skill(s) — migrate them all into the vault now? (recommended)`,
            initialValue: true,
          })
          .catch(() => false);
        if (ok) {
          const { runMigrate } = await import('./commands/migrate.js');
          await runMigrate(io, ctx, { yes: true });
        }
      }
    } catch {
      /* migration offer is best-effort */
    }
  }

  return ctx;
}
