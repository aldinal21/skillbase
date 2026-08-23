import { describe, expect, it } from 'vitest';
import { resolveSkillDir, runFind } from '../src/commands/find.js';
import { createTestIo } from './helpers.js';
import { Vault } from '../src/core/vault.js';
import { GithubClient } from '../src/core/github.js';

const fakeSearch = (async () => [
  { id: 'o/r/tdd', skillId: 'tdd', name: 'tdd', installs: 1000, source: 'o/r' },
  { id: 'o/r/zod', skillId: 'zod', name: 'zod', installs: 50, source: 'o/r' },
]) as unknown as typeof fetch;

function fakeCtx(): any {
  return {
    cfgPath: 'unused',
    cfg: { version: 1, vaultPath: '.', targets: [], updateCheck: { intervalHours: 24, lastCheck: null } },
    vault: new Vault('.'),
    gh: new GithubClient(),
  };
}

describe('resolveSkillDir', () => {
  it('returns first dir whose basename matches', async () => {
    const gh = {
      findSkillDirs: async () => ['skills/zod', 'skills/tdd'],
    };
    expect(await resolveSkillDir(gh as any, { owner: 'o', repo: 'r' }, 'tdd')).toBe('skills/tdd');
    expect(await resolveSkillDir(gh as any, { owner: 'o', repo: 'r' }, 'nope')).toBeNull();
  });
});

describe('runFind non-TTY/query mode', () => {
  it('prints results without prompting', async () => {
    const { io, out } = createTestIo();
    await runFind(io, fakeCtx(), { query: 'tdd' }, { search: fakeSearch as any });
    const joined = out.join('\n');
    expect(joined).toContain('o/r@tdd');
    expect(joined).toContain('1.0K installs');
    expect(joined).toContain('skillbase add');
  });

  it('prints nothing-found message', async () => {
    const { io, out } = createTestIo();
    await runFind(io, fakeCtx(), { query: 'zzz' }, { search: (async () => []) as any });
    expect(out.join('\n')).toMatch(/no skills found/i);
  });
});
