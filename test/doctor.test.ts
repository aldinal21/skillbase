import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Vault } from '../src/core/vault.js';
import { deploy } from '../src/core/sync.js';
import { runChecks } from '../src/core/doctor.js';
import { mkTmp } from './helpers.js';
import type { AppConfig } from '../src/types.js';

const DOC = '---\nname: x\ndescription: d\n---\nbody';

async function setup() {
  const root = await mkTmp();
  const vault = new Vault(path.join(root, 'vault'));
  const targetPath = path.join(root, 'target');
  const cfg: AppConfig = {
    version: 1,
    vaultPath: path.join(root, 'vault'),
    targets: [{ id: 't1', name: 'T', path: targetPath, type: 'custom', active: true }],
    updateCheck: { intervalHours: 24, lastCheck: null },
  };
  return { root, vault, targetPath, cfg };
}

describe('runChecks', () => {
  it('healthy vault yields no issues', async () => {
    const { vault, targetPath, cfg } = await setup();
    const meta = await vault.install('ok', [{ path: 'SKILL.md', contents: DOC }], { type: 'local' });
    const res = await deploy(vault.dirOf('ok'), targetPath, 'ok');
    meta.deployments.push({ targetId: 't1', linkPath: res.linkPath, method: res.method });
    await vault.saveMeta(meta);

    const issues = await runChecks(vault, cfg);
    expect(issues).toHaveLength(0);
  });

  it('detects in-place content edits (hash mismatch)', async () => {
    const { vault, cfg } = await setup();
    await vault.install('x', [{ path: 'SKILL.md', contents: DOC }], { type: 'local' });
    await fs.writeFile(path.join(vault.dirOf('x'), 'SKILL.md'), DOC + ' tampered');

    const issues = await runChecks(vault, cfg);
    expect(issues.some((i) => i.slug === 'x' && i.kind === 'hash-mismatch')).toBe(true);
  });

  it('detects missing and bad deployments', async () => {
    const { vault, cfg } = await setup();
    const meta = await vault.install('x', [{ path: 'SKILL.md', contents: DOC }], { type: 'local' });
    meta.deployments.push({ targetId: 't1', linkPath: path.join(cfg.targets[0]!.path, 'gone'), method: 'symlink' });
    meta.deployments.push({ targetId: 't1', linkPath: path.join(cfg.targets[0]!.path, 'junk'), method: 'copy' });
    await vault.saveMeta(meta);
    await fs.mkdir(path.join(cfg.targets[0]!.path, 'junk'), { recursive: true });
    await fs.writeFile(path.join(cfg.targets[0]!.path, 'junk', 'readme.txt'), 'not a skill');

    const issues = await runChecks(vault, cfg);
    expect(issues.some((i) => i.kind === 'missing-deployment' && i.slug === 'x')).toBe(true);
    expect(issues.some((i) => i.kind === 'bad-deployment' && i.slug === 'x')).toBe(true);
  });

  it('detects unmanaged vault folders and stale target refs', async () => {
    const { vault, cfg } = await setup();
    await fs.mkdir(path.join(vault.root, 'orphan'), { recursive: true });
    const meta = await vault.install('x', [{ path: 'SKILL.md', contents: DOC }], { type: 'local' });
    meta.deployments.push({ targetId: 'ghost', linkPath: path.join(cfg.targets[0]!.path, 'x'), method: 'copy' });
    await vault.saveMeta(meta);

    const issues = await runChecks(vault, cfg);
    expect(issues.some((i) => i.kind === 'unmanaged' && i.slug === 'orphan')).toBe(true);
    expect(issues.some((i) => i.kind === 'stale-target' && i.slug === 'x')).toBe(true);
  });
});
