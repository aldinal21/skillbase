import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { Vault } from '../src/core/vault.js';
import { runUpdate } from '../src/commands/update.js';
import { mkTmp, createTestIo } from './helpers.js';
import type { AppConfig, FetchedFile } from '../src/types.js';

const v1: FetchedFile[] = [{ path: 'SKILL.md', contents: '---\nname: tdd\ndescription: d\n---\nv1' }];
const v2: FetchedFile[] = [{ path: 'SKILL.md', contents: '---\nname: tdd\ndescription: d\n---\nv2\nnew-line' }];

async function setup() {
  const root = await mkTmp();
  const vault = new Vault(path.join(root, 'vault'));
  await vault.install('tdd', v1, { type: 'registry', owner: 'o', repo: 'r', skillId: 'tdd', path: 'skills/tdd' });
  const cfg: AppConfig = {
    version: 1,
    vaultPath: path.join(root, 'vault'),
    targets: [],
    updateCheck: { intervalHours: 24, lastCheck: null },
  };
  return { vault, ctx: { cfgPath: path.join(root, 'config.json'), cfg, vault, gh: null } as any };
}

describe('runUpdate', () => {
  it('updates all outdated after confirmation', async () => {
    const { vault, ctx } = await setup();
    const { io, out } = createTestIo({ confirms: [true] });
    await runUpdate(io, ctx, { all: true }, { downloadDir: async () => v2 });
    const joined = out.join('\n');
    expect(joined).toContain('tdd');
    expect(joined).toMatch(/updated/i);
    expect(await vault.readFiles('tdd')).toEqual(v2);
  });

  it('skips when nothing outdated', async () => {
    const { ctx } = await setup();
    const { io, out } = createTestIo({});
    await runUpdate(io, ctx, { all: true }, { downloadDir: async () => v1 });
    expect(out.join('\n')).toMatch(/up to date/i);
  });

  it('filters by names', async () => {
    const { ctx } = await setup();
    const { io, out } = createTestIo({ confirms: [true] });
    await runUpdate(io, ctx, { names: ['other'] }, { downloadDir: async () => v2 });
    expect(out.join('\n')).toMatch(/no tracked updates/i);
  });

  it('declines confirmation and keeps old content', async () => {
    const { vault, ctx } = await setup();
    const before = (await vault.get('tdd'))!.contentHash;
    const { io } = createTestIo({ confirms: [false] });
    await runUpdate(io, ctx, { names: ['tdd'] }, { downloadDir: async () => v2 });
    expect((await vault.get('tdd'))!.contentHash).toBe(before);
  });
});
