import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { deploy, removeDeployment } from '../src/core/sync.js';
import { mkTmp } from './helpers.js';

async function makeSkill(tmp: string): Promise<string> {
  const dir = path.join(tmp, 'vault', 'tdd');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'SKILL.md'), 'hello');
  return dir;
}

describe('deploy', () => {
  it('creates link whose contents resolve to skill dir', async () => {
    const tmp = await mkTmp();
    const skillDir = await makeSkill(tmp);
    const res = await deploy(skillDir, path.join(tmp, 'target'), 'tdd');
    expect(['symlink', 'junction']).toContain(res.method);
    expect(res.linkPath.toLowerCase()).toBe(path.join(tmp, 'target', 'tdd').toLowerCase());
    await expect(fs.readFile(path.join(res.linkPath, 'SKILL.md'), 'utf8')).resolves.toBe('hello');
  });

  it('is idempotent when link already correct', async () => {
    const tmp = await mkTmp();
    const skillDir = await makeSkill(tmp);
    const first = await deploy(skillDir, path.join(tmp, 'target'), 'tdd');
    const second = await deploy(skillDir, path.join(tmp, 'target'), 'tdd');
    expect(second.method).toBe(first.method);
  });

  it('replaces stale copy at destination', async () => {
    const tmp = await mkTmp();
    const skillDir = await makeSkill(tmp);
    const destDir = path.join(tmp, 'target', 'tdd');
    await fs.mkdir(destDir, { recursive: true });
    await fs.writeFile(path.join(destDir, 'SKILL.md'), 'stale');
    const res = await deploy(skillDir, path.join(tmp, 'target'), 'tdd');
    await expect(fs.readFile(path.join(res.linkPath, 'SKILL.md'), 'utf8')).resolves.toBe('hello');
  });
});

describe('removeDeployment', () => {
  it('removes created deployment', async () => {
    const tmp = await mkTmp();
    const skillDir = await makeSkill(tmp);
    const res = await deploy(skillDir, path.join(tmp, 'target'), 'tdd');
    await removeDeployment(res.linkPath);
    await expect(fs.lstat(res.linkPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('refuses unrelated directories without SKILL.md', async () => {
    const tmp = await mkTmp();
    const other = path.join(tmp, 'precious');
    await fs.mkdir(other);
    await fs.writeFile(path.join(other, 'data.txt'), 'keep me');
    await expect(removeDeployment(other)).rejects.toThrow(/refus/i);
  });
});
