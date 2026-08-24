import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Vault } from '../src/core/vault.js';
import { deploy } from '../src/core/sync.js';
import { adopt, findUnmanaged, linkToVault } from '../src/core/scanner.js';
import { mkTmp } from './helpers.js';

const DOC = '---\nname: legacy-skill\ndescription: old skill\n---\nbody';

describe('findUnmanaged', () => {
  it('detects SKILL.md folders outside the vault', async () => {
    const root = await mkTmp();
    const vault = new Vault(path.join(root, 'vault'));
    await fs.mkdir(vault.root, { recursive: true });
    const targetRoot = path.join(root, '.agents', 'skills');
    await fs.mkdir(path.join(targetRoot, 'legacy'), { recursive: true });
    await fs.writeFile(path.join(targetRoot, 'legacy', 'SKILL.md'), DOC);

    const found = await findUnmanaged(
      vault,
      [{ id: 't1', name: 'T', path: path.join(root, '.agents', 'skills'), type: 'custom', active: true }],
      root,
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ slugGuess: 'legacy', name: 'legacy-skill', targetId: 't1' });
  });

  it('skips links pointing into the vault', async () => {
    const root = await mkTmp();
    const vault = new Vault(path.join(root, 'vault'));
    const files = [{ path: 'SKILL.md', contents: DOC }];
    await vault.install('legacy', files, { type: 'local' });
    const targetRoot = path.join(root, 'skills');
    await deploy(vault.dirOf('legacy'), targetRoot, 'legacy');

    const found = await findUnmanaged(
      vault,
      [{ id: 't1', name: 'T', path: targetRoot, type: 'custom', active: true }],
      root,
    );
    expect(found).toHaveLength(0);
  });

  it('detects foreign symlinks (e.g. installed by other tools) as candidates', async () => {
    const root = await mkTmp();
    const vault = new Vault(path.join(root, 'vault'));
    // canonical copy elsewhere, symlinked into the target dir like `npx skills` does
    const canonical = path.join(root, 'canonical', 'ext-skill');
    await fs.mkdir(canonical, { recursive: true });
    await fs.writeFile(path.join(canonical, 'SKILL.md'), DOC.replace('legacy-skill', 'ext-skill'));
    const targetRoot = path.join(root, 'skills');
    await fs.mkdir(targetRoot, { recursive: true });
    const type = process.platform === 'win32' ? ('junction' as const) : ('dir' as const);
    await fs.symlink(canonical, path.join(targetRoot, 'ext-skill'), type);

    const found = await findUnmanaged(
      vault,
      [{ id: 't1', name: 'T', path: targetRoot, type: 'custom', active: true }],
      root,
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ slugGuess: 'ext-skill', name: 'ext-skill' });

    // adopting moves content into vault and replaces the foreign link with a vault link
    const meta = await adopt(vault, found[0]!);
    expect(meta.slug).toBe('ext-skill');
    const real = await fs.realpath(path.join(targetRoot, 'ext-skill'));
    expect(real.startsWith(await fs.realpath(vault.root))).toBe(true);
  });

  it('flags known slugs as duplicates and relinks them to the vault', async () => {
    const root = await mkTmp();
    const vault = new Vault(path.join(root, 'vault'));
    await vault.install('legacy', [{ path: 'SKILL.md', contents: DOC }], { type: 'local' });

    // a foreign REAL folder with the same slug (not a vault link)
    const targetRoot = path.join(root, 'skills');
    const dupDir = path.join(targetRoot, 'legacy');
    await fs.mkdir(dupDir, { recursive: true });
    await fs.writeFile(path.join(dupDir, 'SKILL.md'), DOC);

    const found = await findUnmanaged(
      vault,
      [{ id: 't1', name: 'T', path: targetRoot, type: 'custom', active: true }],
      root,
    );
    expect(found).toHaveLength(1);
    expect(found[0]!.duplicate).toBe(true);

    const meta = await linkToVault(vault, found[0]!);
    expect(meta!.deployments.some((d) => d.targetId === 't1')).toBe(true);
    const real = await fs.realpath(dupDir);
    expect(real.startsWith(await fs.realpath(vault.root))).toBe(true);
  });
});

describe('adopt', () => {
  it('moves into vault and relinks original location', async () => {
    const root = await mkTmp();
    const vault = new Vault(path.join(root, 'vault'));
    const orig = path.join(root, 'skills', 'legacy');
    await fs.mkdir(orig, { recursive: true });
    await fs.writeFile(path.join(orig, 'SKILL.md'), DOC);

    const meta = await adopt(vault, {
      targetId: 't1',
      dir: orig,
      slugGuess: 'legacy',
      name: 'legacy-skill',
      description: 'old skill',
    });
    expect(meta.slug).toBe('legacy');
    await expect(fs.readFile(vault.dirOf('legacy') + '/SKILL.md', 'utf8')).resolves.toBe(DOC);
    // original path now resolves into the vault
    await expect(fs.readFile(path.join(orig, 'SKILL.md'), 'utf8')).resolves.toBe(DOC);
    expect(meta.deployments[0]!.linkPath.toLowerCase()).toBe(orig.toLowerCase());
  });
});
