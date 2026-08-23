import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { GithubClient, parseSource } from '../src/core/github.js';
import { deploy } from '../src/core/sync.js';
import { Vault } from '../src/core/vault.js';
import { applyUpdate, checkUpdates } from '../src/core/updater.js';
import { searchSkills } from '../src/core/registry.js';
import { mkTmp } from './helpers.js';

const RAW: Record<string, string> = {
  'SKILL.md': '---\nname: webdev\ndescription: Web dev rules\n---\nrule v1',
  'refs/stack.md': 'stack notes',
};
let TREE = Object.keys(RAW).map((p) => ({ path: `skills/webdev/${p}`, type: 'blob' as const }));

function fakeFetch(url: any): Promise<Response> {
  const u = String(url);
  if (u.includes('/api/search')) {
    return Promise.resolve(
      new Response(
        JSON.stringify({
          skills: [{ id: 'o/r/webdev', skillId: 'webdev', name: 'webdev', installs: 10, source: 'o/r' }],
        }),
        { status: 200 },
      ),
    );
  }
  if (u.includes('/git/trees/')) {
    return Promise.resolve(new Response(JSON.stringify({ tree: TREE, truncated: false }), { status: 200 }));
  }
  for (const [p, c] of Object.entries(RAW)) {
    if (u.endsWith(`/skills/webdev/${p}`)) return Promise.resolve(new Response(c, { status: 200 }));
  }
  return Promise.resolve(new Response('nf', { status: 404 }));
}

describe('full lifecycle (fake network)', () => {
  it('search -> add -> sync -> update -> purge', async () => {
    const root = await mkTmp();
    const vault = new Vault(path.join(root, 'vault'));
    const targetA = path.join(root, 'a-skills');
    const targetB = path.join(root, 'b-skills');
    const gh = new GithubClient(fakeFetch as typeof fetch);

    // 1. registry search shape
    const reg = await searchSkills('webdev', 5, fakeFetch as typeof fetch);
    expect(reg[0]!.id).toBe('o/r/webdev');

    // 2. add (resolve source -> download -> validate -> install)
    const parsed = parseSource('o/r@webdev');
    expect(parsed).toMatchObject({ kind: 'github' });
    const dir = (await gh.findSkillDirs({ owner: 'o', repo: 'r' })).find((d) => d.endsWith('webdev'))!;
    const files = await gh.downloadDir({ owner: 'o', repo: 'r' }, dir);
    expect(files.map((f) => f.path)).toEqual(['SKILL.md', 'refs/stack.md']);
    const meta = await vault.install('webdev', files, {
      type: 'registry',
      owner: 'o',
      repo: 'r',
      path: dir,
      skillId: 'webdev',
    });

    // 3. sync to two targets
    const d1 = await deploy(vault.dirOf('webdev'), targetA, 'webdev');
    const d2 = await deploy(vault.dirOf('webdev'), targetB, 'webdev');
    meta.deployments.push({ targetId: 'a', linkPath: d1.linkPath, method: d1.method });
    meta.deployments.push({ targetId: 'b', linkPath: d2.linkPath, method: d2.method });
    await vault.saveMeta(meta);
    await expect(fs.readFile(path.join(targetA, 'webdev', 'SKILL.md'), 'utf8')).resolves.toContain('v1');

    // 4. upstream changes -> check detects -> apply propagates to copies
    RAW['SKILL.md'] = '---\nname: webdev\ndescription: Web dev rules\n---\nrule v2';
    const outdated = await checkUpdates(vault, (ref, d) => gh.downloadDir(ref, d), { timeoutMs: 2000 });
    expect(outdated).toHaveLength(1);
    const updated = await applyUpdate(vault, outdated[0]!);
    await expect(fs.readFile(path.join(targetB, 'webdev', 'SKILL.md'), 'utf8')).resolves.toContain('v2');
    expect(updated.contentHash).not.toBe(meta.contentHash);

    // 5. purge everywhere
    for (const dep of updated.deployments) await fs.rm(dep.linkPath, { recursive: true, force: true });
    await vault.remove('webdev');
    expect(await vault.list()).toHaveLength(0);
  });
});
