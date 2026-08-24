import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Vault } from '../src/core/vault.js';
import { deploy } from '../src/core/sync.js';
import { runRemove } from '../src/commands/remove.js';
import { runScan } from '../src/commands/scan.js';
import { mkTmp, createTestIo } from './helpers.js';
import type { AppConfig } from '../src/types.js';

const DOC = '---\nname: tdd\ndescription: d\n---\nx';

async function setup() {
  const root = await mkTmp();
  const vault = new Vault(path.join(root, 'vault'));
  const targetPath = path.join(root, 'target');
  const meta = await vault.install('tdd', [{ path: 'SKILL.md', contents: DOC }], { type: 'local' });
  const res = await deploy(vault.dirOf('tdd'), targetPath, 'tdd');
  meta.deployments.push({ targetId: 't1', linkPath: res.linkPath, method: res.method });
  await vault.saveMeta(meta);
  const cfg: AppConfig = {
    version: 1,
    vaultPath: path.join(root, 'vault'),
    targets: [{ id: 't1', name: 'T', path: targetPath, type: 'custom', active: true }],
    updateCheck: { intervalHours: 24, lastCheck: null },
  };
  return {
    root,
    vault,
    targetPath,
    ctx: { cfgPath: path.join(root, 'config.json'), cfg, vault, gh: null } as any,
  };
}

describe('runRemove', () => {
  it('removes deployments and keeps vault copy by default', async () => {
    const { ctx, vault, targetPath } = await setup();
    const { io } = createTestIo({ confirms: [true] });
    await runRemove(io, ctx, { name: 'tdd' });
    await expect(fs.lstat(path.join(targetPath, 'tdd'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await vault.get('tdd'))!.deployments).toHaveLength(0);
    expect(await vault.get('tdd')).not.toBeNull();
  });

  it('--purge deletes vault copy too', async () => {
    const { ctx, vault, targetPath } = await setup();
    const { io } = createTestIo({});
    await runRemove(io, ctx, { name: 'tdd', purge: true });
    expect(await vault.get('tdd')).toBeNull();
    await expect(fs.lstat(path.join(targetPath, 'tdd'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

describe('runScan', () => {
  it('adopts selected unmanaged folders in one batch', async () => {
    const { root, ctx, vault } = await setup();
    const planted = path.join(root, 'target', 'legacy');
    await fs.mkdir(planted, { recursive: true });
    await fs.writeFile(path.join(planted, 'SKILL.md'), DOC.replace('tdd', 'legacy'));

    const { io, out } = createTestIo({ multis: [['legacy']] }); // preselected batch checklist
    await runScan(io, ctx, {}, { interactive: true });
    expect(await vault.get('legacy')).not.toBeNull();
    // original location now serves vault content through a link
    await expect(fs.readFile(path.join(planted, 'SKILL.md'), 'utf8')).resolves.toBe(
      DOC.replace('tdd', 'legacy'),
    );
    expect(out.join('\n')).toMatch(/adopted 1/i);
  });

  it('declining selection adopts nothing', async () => {
    const { root, ctx, vault } = await setup();
    const planted = path.join(root, 'target', 'legacy');
    await fs.mkdir(planted, { recursive: true });
    await fs.writeFile(path.join(planted, 'SKILL.md'), DOC.replace('tdd', 'legacy'));

    const { io } = createTestIo({ multis: [[]] }); // user unchecks everything
    await runScan(io, ctx, {}, { interactive: true });
    expect(await vault.get('legacy')).toBeNull();
  });

  it('non-interactive mode lists without prompting', async () => {
    const { root, ctx, vault } = await setup();
    const planted = path.join(root, 'target', 'legacy');
    await fs.mkdir(planted, { recursive: true });
    await fs.writeFile(path.join(planted, 'SKILL.md'), DOC.replace('tdd', 'legacy'));

    const { io, out } = createTestIo({});
    await runScan(io, ctx, {}, { interactive: false });
    expect(out.join('\n')).toMatch(/legacy/);
    expect(await vault.get('legacy')).toBeNull();
  });
});
