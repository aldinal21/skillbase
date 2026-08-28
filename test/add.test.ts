import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { runAdd } from '../src/commands/add.js';
import { Vault } from '../src/core/vault.js';
import { mkTmp, createTestIo } from './helpers.js';
import type { AppConfig } from '../src/types.js';

const DOC = '---\nname: tdd\ndescription: TDD guidance\n---\ndo tdd';
const FILES: Record<string, string> = { 'SKILL.md': DOC, 'refs/a.md': 'A' };

function fakeGh(treeDirs: string[]) {
  return {
    findSkillDirs: async () => treeDirs,
    downloadDir: async (_ref: any, dir: string) =>
      Object.entries(FILES).map(([p, c]) => ({
        path: p.startsWith(dir + '/') ? p.slice(dir.length + 1) : p,
        contents: c,
      })),
    repoSkills: async () =>
      treeDirs.filter((d) => d !== '').map((d) => ({ name: d.split('/').pop()!, dir: d })),
  } as any;
}

async function setup() {
  const root = await mkTmp();
  const vault = new Vault(path.join(root, 'vault'));
  const cfg: AppConfig = {
    version: 1,
    vaultPath: path.join(root, 'vault'),
    targets: [{ id: 't1', name: 'Local target', path: path.join(root, 'target'), type: 'custom', active: true }],
    updateCheck: { intervalHours: 24, lastCheck: null },
  };
  return { root, vault, cfg, ctx: { cfgPath: path.join(root, 'config.json'), cfg, vault, gh: null } as any };
}

describe('runAdd', () => {
  it('adds a local skill and deploys to selected target', async () => {
    const { root, vault, cfg, ctx } = await setup();
    const srcDir = path.join(root, 'my-skill');
    await fs.mkdir(srcDir, { recursive: true });
    await fs.writeFile(path.join(srcDir, 'SKILL.md'), DOC);

    const { io } = createTestIo({ confirms: [true], multis: [['t1']] });
    const meta = await runAdd(io, ctx, { source: srcDir }, {});
    expect(meta?.slug).toBe('tdd'); // slug comes from SKILL.md frontmatter name
    expect(meta!.contentHash).toMatch(/^sha256-/);
    expect(meta!.deployments).toHaveLength(1);
    await expect(fs.readFile(path.join(root, 'target', 'tdd', 'SKILL.md'), 'utf8')).resolves.toBe(DOC);
    expect(cfg.targets).toHaveLength(1);
    expect(await vault.get('tdd')).not.toBeNull();
  });

  it('adds from fake github source with skill name', async () => {
    const { root, vault, ctx } = await setup();
    const gh = fakeGh(['skills/tdd']);
    const { io } = createTestIo({ confirms: [true], multis: [[]] });
    const meta = await runAdd(io, ctx, { source: 'o/r@tdd' }, { gh });
    expect(meta?.slug).toBe('tdd-o'); // registry installs are namespaced as <name>-<owner>
    expect(meta?.originalName).toBe('tdd');
    const paths = (await vault.readFiles('tdd-o')).map((f) => f.path);
    expect(paths).toContain('refs/a.md');
    const skillMd = (await vault.readFiles('tdd-o')).find((f) => f.path === 'SKILL.md')!;
    expect(skillMd.contents).toContain('name: tdd-o');
    await expect(fs.readFile(path.join(root, 'target', 'tdd-o', 'SKILL.md'), 'utf8')).rejects.toThrow(); // not deployed (empty multiselect)
  });

  it('uses numeric suffix when the namespaced slug collides', async () => {
    const { vault, ctx } = await setup();
    await vault.install(
      'tdd-o',
      [{ path: 'SKILL.md', contents: DOC.replace('name: tdd', 'name: tdd-o') }],
      { type: 'registry', owner: 'o', repo: 'other', path: 'skills/tdd', skillId: 'tdd' },
    );
    const gh = fakeGh(['skills/tdd']);
    const { io } = createTestIo({ confirms: [true, false], multis: [[]] }); // add=yes, overwrite=no
    const meta = await runAdd(io, ctx, { source: 'o/r@tdd' }, { gh });
    expect(meta?.slug).toBe('tdd-o-2');
  });

  it('auto-renames on collision when not overwriting', async () => {
    const { root, vault, ctx } = await setup();
    await vault.install('dup', [{ path: 'SKILL.md', contents: DOC }], { type: 'local' });
    const srcDir = path.join(root, 'other-src');
    await fs.mkdir(srcDir, { recursive: true });
    await fs.writeFile(path.join(srcDir, 'SKILL.md'), DOC.replace('name: tdd', 'name: dup'));

    const { io } = createTestIo({ confirms: [true, false], multis: [[]] }); // add=yes, overwrite=no -> rename
    const meta = await runAdd(io, ctx, { source: srcDir }, {});
    expect(meta?.slug).toBe('dup-local'); // rename suffix strategy: -owner or -local for local sources
  });

  it('rejects invalid frontmatter before touching vault', async () => {
    const { root, vault, ctx } = await setup();
    const bad = path.join(root, 'bad');
    await fs.mkdir(bad, { recursive: true });
    await fs.writeFile(path.join(bad, 'SKILL.md'), 'no frontmatter');
    const { io, out } = createTestIo({});
    const meta = await runAdd(io, ctx, { source: bad }, {});
    expect(meta).toBeNull();
    expect(out.join('\n')).toMatch(/frontmatter/i);
    expect(await vault.list()).toHaveLength(0);
  });
});
