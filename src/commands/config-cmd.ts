import fs from 'node:fs/promises';
import path from 'node:path';
import picocolors from 'picocolors';
import { expandHome, saveConfig } from '../core/config.js';
import { renderTable } from '../ui/table.js';
import type { CliCtx } from '../context.js';
import type { CliIo } from '../ui/io.js';
import type { AppConfig } from '../types.js';

export type ConfigKey = 'vaultPath' | 'intervalHours' | 'disableChecks';

export async function applyConfigSet(cfg: AppConfig, key: ConfigKey, value: string): Promise<AppConfig> {
  if (key === 'intervalHours') {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) throw new Error('intervalHours must be a number >= 0');
    return { ...cfg, updateCheck: { ...cfg.updateCheck, intervalHours: n } };
  }
  if (key === 'disableChecks') {
    const off = value === 'true' || value === '1';
    return { ...cfg, updateCheck: { ...cfg.updateCheck, intervalHours: off ? 0 : 24 } };
  }
  // vaultPath — move directory
  const from = expandHome(cfg.vaultPath);
  const to = expandHome(value);
  if (path.resolve(from) !== path.resolve(to)) {
    await fs.mkdir(path.dirname(to), { recursive: true });
    try {
      await fs.rename(from, to);
    } catch {
      await fs.cp(from, to, { recursive: true });
      await fs.rm(from, { recursive: true, force: true });
    }
  }
  return { ...cfg, vaultPath: value };
}

const VALID_KEYS: ConfigKey[] = ['vaultPath', 'intervalHours', 'disableChecks'];

export async function runConfig(io: CliIo, ctx: CliCtx, opts: { key?: string; value?: string }): Promise<void> {
  if (!opts.key) {
    io.info(
      renderTable(['KEY', 'VALUE'], [
        ['vaultPath', ctx.cfg.vaultPath],
        ['intervalHours', String(ctx.cfg.updateCheck.intervalHours)],
        ['targets', String(ctx.cfg.targets.length)],
      ]),
    );
    io.info(picocolors.dim('Usage: skillbase config <vaultPath|intervalHours|disableChecks> <value>'));
    return;
  }
  const key = opts.key as ConfigKey;
  if (!VALID_KEYS.includes(key)) {
    io.error(`Unknown key "${opts.key}" (valid: ${VALID_KEYS.join(', ')})`);
    return;
  }
  if (opts.value === undefined) {
    io.error('Missing value');
    return;
  }
  ctx.cfg = await applyConfigSet(ctx.cfg, key, opts.value);
  await saveConfig(ctx.cfg, ctx.cfgPath);
  io.outro('Saved.');
}
