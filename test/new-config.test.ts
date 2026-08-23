import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Vault } from '../src/core/vault.js';
import { applyConfigSet } from '../src/commands/config-cmd.js';
import { runNew } from '../src/commands/new.js';
import { mkTmp, createTestIo } from './helpers.js';
import type { AppConfig } from '../src/types.js';

const baseCfg = (root: string): AppConfig => ({
  version: 1,
  vaultPath: path.join(root, 'vault'),
  targets: [],
  updateCheck: { intervalHours: 24, lastCheck: null },
});

describe('runNew', () => {
  it('scaffolds a valid skill into the vault', async () => {
    const root = await mkTmp();
    const vault = new Vault(path.join(root, 'vault'));
    const { io } = createTestIo({ texts: ['my-skill'] });
    const meta = await runNew(io, { cfgPath: '', cfg: baseCfg(root), vault, gh: null as any }, {});
    expect(meta?.slug).toBe('my-skill');
    const files = await vault.readFiles('my-skill');
    expect(files[0]!.contents).toMatch(/^---\nname: my-skill\ndescription: /);
  });

  it('rejects invalid names', async () => {
    const root = await mkTmp();
    const vault = new Vault(path.join(root, 'vault'));
    const { io, out } = createTestIo({ texts: ['Bad Name!'] });
    const meta = await runNew(io, { cfgPath: '', cfg: baseCfg(root), vault, gh: null as any }, {});
    expect(meta).toBeUndefined();
    expect(out.join('\n')).toMatch(/lowercase/i);
  });
});

describe('applyConfigSet', () => {
  it('sets interval hours', async () => {
    const cfg = await applyConfigSet(baseCfg('/r'), 'intervalHours', '48');
    expect(cfg.updateCheck.intervalHours).toBe(48);
  });

  it('disableChecks zeroes the interval', async () => {
    const cfg = await applyConfigSet(baseCfg('/r'), 'disableChecks', 'true');
    expect(cfg.updateCheck.intervalHours).toBe(0);
  });

  it('rejects bad numbers', async () => {
    await expect(applyConfigSet(baseCfg('/r'), 'intervalHours', 'abc')).rejects.toThrow(/number/i);
  });

  it('moves vault directory on vaultPath change', async () => {
    const root = await mkTmp();
    const oldV = path.join(root, 'vault');
    await fs.mkdir(oldV, { recursive: true });
    await fs.writeFile(path.join(oldV, 'marker.txt'), 'x');
    const newV = path.join(root, 'vault2');
    const cfg = await applyConfigSet(baseCfg(root), 'vaultPath', newV);
    expect(cfg.vaultPath).toBe(newV);
    await expect(fs.readFile(path.join(newV, 'marker.txt'), 'utf8')).resolves.toBe('x');
  });
});
