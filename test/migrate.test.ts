import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Vault } from '../src/core/vault.js';
import { runMigrate } from '../src/commands/migrate.js';
import { mkTmp, createTestIo } from './helpers.js';
import type { AppConfig } from '../src/types.js';

const DOC = (name: string) => `---\nname: ${name}\ndescription: ${name} desc\n---\nbody`;

function searchFetch(skills: unknown[]): typeof fetch {
  return (async () => new Response(JSON.stringify({ skills }), { status: 200 })) as typeof fetch;
}

const REGISTRY = {
  alpha: [{ id: 'o/r/alpha', skillId: 'alpha', name: 'alpha', installs: 100, source: 'o/r' }],
  beta: [] as unknown[],
  gamma: [
    { id: 'a/s/gamma', skillId: 'gamma', name: 'gamma', installs: 50, source: 'a/s' },
    { id: 'b/e/gamma', skillId: 'gamma', name: 'gamma', installs: 5, source: 'b/e' },
  ],
};

function fakeFetchFor(url: any): Promise<Response> {
  const q = String(url).match(/q=([^&]+)/)?.[1] ?? '';
  const key = decodeURIComponent(q);
  return Promise.resolve(new Response(JSON.stringify({ skills: REGISTRY[key as keyof typeof REGISTRY] ?? [] }), { status: 200 }));
}

async function setup() {
  const root = await mkTmp();
  const vault = new Vault(path.join(root, 'vault'));
  const targetPath = path.join(root, 'agents-skills');
  await fs.mkdir(targetPath, { recursive: true });
  const cfg: AppConfig = {
    version: 1,
    vaultPath: path.join(root, 'vault'),
    targets: [{ id: 't1', name: 'Targets', path: targetPath, type: 'custom', active: true }],
    updateCheck: { intervalHours: 24, lastCheck: null },
  };
  const gh = { findSkillDirs: async () => ['skills/alpha', 'skills/beta', 'skills/gamma', 'skills/dup'] } as any;
  const ctx: any = { cfgPath: path.join(root, 'config.json'), cfg, vault, gh };
  const deps = {
    interactive: true,
    search: fakeFetchFor,
    detectPresets: async () => [],
  } as const;
  return { root, vault, targetPath, ctx, deps };
}

async function plant(targetPath: string, slug: string): Promise<void> {
  const dir = path.join(targetPath, slug);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'SKILL.md'), DOC(slug));
}

describe('runMigrate', () => {
  it('adopts, tracks unique origin, keeps ambiguous/local, relinks duplicates', async () => {
    const { targetPath, vault, ctx, deps } = await setup();
    await plant(targetPath, 'alpha');
    await plant(targetPath, 'beta');
    await plant(targetPath, 'gamma');
    // duplicate: slug already managed, foreign real folder present
    await vault.install('dup', [{ path: 'SKILL.md', contents: DOC('dup') }], { type: 'local' });
    await plant(targetPath, 'dup');

    const { io, out } = createTestIo({ confirms: [true] });
    await runMigrate(io, ctx, {}, deps as any);

    const joined = out.join('\n');
    expect(joined).toMatch(/Adopted \+ tracked\s+1\b/); // alpha
    expect(joined).toMatch(/Adopted \+ local\s+2\b/); // beta + gamma(ambiguous)
    expect(joined).toMatch(/Duplicates relinked\s+1\b/);
    expect(joined).toMatch(/Ambiguous .+gamma/);
    expect(joined).toContain('a/s@gamma');

    expect((await vault.get('alpha'))!.source.type).toBe('registry');
    expect((await vault.get('beta'))!.source.type).toBe('local');
    expect((await vault.get('gamma'))!.source.type).toBe('local');
    // dup folder replaced by link into vault
    const real = await fs.realpath(path.join(targetPath, 'dup'));
    expect(real.startsWith(await fs.realpath(vault.root))).toBe(true);
  });

  it('dry-run changes nothing', async () => {
    const { targetPath, vault, ctx, deps } = await setup();
    await plant(targetPath, 'alpha');
    const { io } = createTestIo({});
    await runMigrate(io, ctx, { dryRun: true }, deps as any);
    expect(await vault.list()).toHaveLength(0);
    const stat = await fs.lstat(path.join(targetPath, 'alpha'));
    expect(stat.isSymbolicLink()).toBe(false);
  });

  it('non-interactive proceeds without confirm', async () => {
    const { targetPath, vault, ctx, deps } = await setup();
    await plant(targetPath, 'beta');
    const { io } = createTestIo({});
    await runMigrate(io, ctx, { yes: true }, { ...deps, interactive: false } as any);
    expect(await vault.get('beta')).not.toBeNull();
  });
});
