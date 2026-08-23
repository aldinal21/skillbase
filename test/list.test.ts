import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { Vault } from '../src/core/vault.js';
import { GithubClient } from '../src/core/github.js';
import { runList } from '../src/commands/list.js';
import { mkTmp, createTestIo } from './helpers.js';
import type { AppConfig } from '../src/types.js';

async function ctxWithSkills(): Promise<{ ctx: any; root: string }> {
  const root = await mkTmp();
  const vault = new Vault(path.join(root, 'vault'));
  await vault.install('tdd', [{ path: 'SKILL.md', contents: '---\nname: tdd\ndescription: d\n---\nx' }], {
    type: 'registry',
    owner: 'o',
    repo: 'r',
    skillId: 'tdd',
  });
  await vault.install('mine', [{ path: 'SKILL.md', contents: '---\nname: mine\ndescription: d\n---\nx' }], {
    type: 'local',
  });
  const cfg: AppConfig = {
    version: 1,
    vaultPath: path.join(root, 'vault'),
    targets: [],
    updateCheck: { intervalHours: 24, lastCheck: null },
  };
  return { ctx: { cfgPath: path.join(root, 'config.json'), cfg, vault, gh: new GithubClient() }, root };
}

describe('runList', () => {
  it('lists skills with source and status', async () => {
    const { ctx } = await ctxWithSkills();
    const { io, out } = createTestIo();
    await runList(io, ctx, {});
    const joined = out.join('\n');
    expect(joined).toContain('tdd');
    expect(joined).toContain('mine');
    expect(joined).toContain('o/r');
    expect(joined).toContain('local');
  });

  it('prints empty notice when vault empty', async () => {
    const root = await mkTmp();
    const ctx = {
      cfgPath: path.join(root, 'c.json'),
      cfg: {
        version: 1,
        vaultPath: path.join(root, 'v'),
        targets: [],
        updateCheck: { intervalHours: 24, lastCheck: null },
      },
      vault: new Vault(path.join(root, 'v')),
      gh: new GithubClient(),
    };
    const { io, out } = createTestIo();
    await runList(io, ctx, {});
    expect(out.join('\n')).toMatch(/no skills/i);
  });
});
