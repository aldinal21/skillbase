import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { Vault } from '../src/core/vault.js';
import { applyUpdate, checkUpdates, maybeCheckForUpdates, summarizeChanges } from '../src/core/updater.js';
import { rewriteSkillName } from '../src/core/frontmatter.js';
import { mkTmp } from './helpers.js';
import type { AppConfig, FetchedFile } from '../src/types.js';

const v1: FetchedFile[] = [{ path: 'SKILL.md', contents: '---\nname: tdd\ndescription: d\n---\nv1' }];
const v2: FetchedFile[] = [{ path: 'SKILL.md', contents: '---\nname: tdd\ndescription: d\n---\nv2' }];
const src = { type: 'registry', owner: 'o', repo: 'r', path: 'skills/tdd', skillId: 'tdd' } as const;

describe('summarizeChanges', () => {
  it('classifies added/removed/changed', () => {
    const cur: FetchedFile[] = [
      { path: 'SKILL.md', contents: 'a' },
      { path: 'old.md', contents: 'x' },
    ];
    const lat: FetchedFile[] = [
      { path: 'SKILL.md', contents: 'b' },
      { path: 'new.md', contents: 'y' },
    ];
    const s = summarizeChanges(cur, lat);
    expect(s.changed).toEqual(['SKILL.md']);
    expect(s.removed).toEqual(['old.md']);
    expect(s.added).toEqual(['new.md']);
  });
});

describe('checkUpdates + applyUpdate', () => {
  it('detects outdated and applies', async () => {
    const root = await mkTmp();
    const vault = new Vault(path.join(root, 'vault'));
    await vault.install('tdd', v1, src);

    const outdated = await checkUpdates(vault, async () => v2, { timeoutMs: 500 });
    expect(outdated).toHaveLength(1);
    expect(outdated[0]!.meta.slug).toBe('tdd');

    const beforeHash = (await vault.get('tdd'))!.contentHash;
    const meta = await applyUpdate(vault, outdated[0]!);
    expect(meta.contentHash).not.toBe(beforeHash);
    expect((await vault.get('tdd'))!.contentHash).toBe(meta.contentHash);
    expect(await vault.readFiles('tdd')).toEqual(v2);
  });

  it('skips local-source skills', async () => {
    const root = await mkTmp();
    const vault = new Vault(path.join(root, 'vault'));
    await vault.install('mine', v1, { type: 'local' });
    const outdated = await checkUpdates(vault, async () => v2, { timeoutMs: 200 });
    expect(outdated).toHaveLength(0);
  });

  it('skips upstream snapshots without SKILL.md (source anomaly)', async () => {
    const root = await mkTmp();
    const vault = new Vault(path.join(root, 'vault'));
    await vault.install('tdd', v1, src);
    const junk: FetchedFile[] = [{ path: 'README.md', contents: 'repo without skills' }];
    const outdated = await checkUpdates(vault, async () => junk, { timeoutMs: 200 });
    expect(outdated).toHaveLength(0);
  });
});

describe('checkUpdates with namespaced installs (originalName set)', () => {
  it('does not report false positives when upstream is unchanged', async () => {
    const root = await mkTmp();
    const vault = new Vault(path.join(root, 'vault'));
    // Simulate the new add flow: upstream files get their name rewritten before install.
    await vault.install('tdd-o', rewriteSkillName(v1, 'tdd-o'), src, 'tdd');

    const outdated = await checkUpdates(vault, async () => v1, { timeoutMs: 500 });
    expect(outdated).toHaveLength(0);
  });

  it('detects real changes, applies them, and keeps the local name stable', async () => {
    const root = await mkTmp();
    const vault = new Vault(path.join(root, 'vault'));
    await vault.install('tdd-o', rewriteSkillName(v1, 'tdd-o'), src, 'tdd');

    const outdated = await checkUpdates(vault, async () => v2, { timeoutMs: 500 });
    expect(outdated).toHaveLength(1);
    await applyUpdate(vault, outdated[0]!);

    const files = await vault.readFiles('tdd-o');
    const md = files.find((f) => f.path === 'SKILL.md')!.contents;
    expect(md).toContain('name: tdd-o'); // local identity survives the update
    expect(md).toContain('v2'); // body came from upstream
  });

  it('keeps the local name even when upstream renamed the skill', async () => {
    const root = await mkTmp();
    const vault = new Vault(path.join(root, 'vault'));
    await vault.install('tdd-o', rewriteSkillName(v1, 'tdd-o'), src, 'tdd');

    const renamed: FetchedFile[] = [
      { path: 'SKILL.md', contents: '---\nname: test-driven-development\ndescription: d\n---\nv2' },
    ];
    const outdated = await checkUpdates(vault, async () => renamed, { timeoutMs: 500 });
    expect(outdated).toHaveLength(1);
    await applyUpdate(vault, outdated[0]!);
    const md = (await vault.readFiles('tdd-o')).find((f) => f.path === 'SKILL.md')!.contents;
    expect(md).toContain('name: tdd-o');
    expect(md).not.toContain('test-driven-development');
  });
});

describe('maybeCheckForUpdates', () => {
  it('respects interval and stamps lastCheck', async () => {
    const root = await mkTmp();
    const cfgPath = path.join(root, 'config.json');
    const cfg: AppConfig = {
      version: 1,
      vaultPath: path.join(root, 'vault'),
      targets: [],
      updateCheck: { intervalHours: 24, lastCheck: null },
    };
    const vault = new Vault(path.join(root, 'vault'));

    const n1 = await maybeCheckForUpdates({ cfg, cfgPath, vault, downloadDir: async () => v2, force: true });
    expect(n1).toBe(0);
    expect(cfg.updateCheck.lastCheck).toBeTruthy();

    const saved = JSON.parse(await (await import('node:fs/promises')).readFile(cfgPath, 'utf8'));
    expect(saved.updateCheck.lastCheck).toBeTruthy();
  });
});
