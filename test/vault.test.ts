import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { Vault, hashSkillFiles } from '../src/core/vault.js';
import { mkTmp } from './helpers.js';
import type { FetchedFile, SkillSource } from '../src/types.js';

const files: FetchedFile[] = [
  { path: 'SKILL.md', contents: '---\nname: tdd\ndescription: d\n---\n# hi' },
  { path: 'refs/x.md', contents: 'ref' },
];
const src: SkillSource = { type: 'registry', owner: 'o', repo: 'r', path: 'skills/tdd', skillId: 'tdd' };

describe('hashSkillFiles', () => {
  it('order-independent and changes with content', async () => {
    const a = await hashSkillFiles(files);
    const b = await hashSkillFiles([...files].reverse());
    expect(a).toBe(b);
    expect(a).toMatch(/^sha256-[0-9a-f]{64}$/);
    const c = await hashSkillFiles([files[0]!, { path: 'refs/x.md', contents: 'changed' }]);
    expect(c).not.toBe(a);
  });
});

describe('Vault', () => {
  it('install -> get -> readFiles round trip', async () => {
    const v = new Vault(path.join(await mkTmp(), 'vault'));
    const meta = await v.install('tdd', files, src);
    expect(meta.contentHash).toMatch(/^sha256-/);
    expect((await v.get('tdd'))?.slug).toBe('tdd');
    expect(await v.readFiles('tdd')).toEqual(files.map((f) => ({ path: f.path, contents: f.contents })));
    expect(await v.list()).toHaveLength(1);
  });

  it('rejects path traversal in file paths', async () => {
    const v = new Vault(path.join(await mkTmp(), 'vault'));
    await expect(
      v.install('evil', [{ path: '../escape.txt', contents: 'x' }], src),
    ).rejects.toThrow(/traversal|outside/i);
  });

  it('replaceContents updates hash and updatedAt', async () => {
    const v = new Vault(path.join(await mkTmp(), 'vault'));
    const m1 = await v.install('tdd', files, src);
    const changed: FetchedFile[] = [{ path: 'SKILL.md', contents: '---\nname: tdd\ndescription: d\n---\n# v2' }];
    const m2 = await v.replaceContents('tdd', changed);
    expect(m2.contentHash).not.toBe(m1.contentHash);
    expect(new Date(m2.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(m1.updatedAt).getTime());
    expect(await v.hashOf('tdd')).toBe(m2.contentHash);
  });

  it('remove deletes directory', async () => {
    const v = new Vault(path.join(await mkTmp(), 'vault'));
    await v.install('tdd', files, src);
    await v.remove('tdd');
    expect(await v.get('tdd')).toBeNull();
    expect(await v.list()).toHaveLength(0);
  });
});
