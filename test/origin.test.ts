import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { Vault } from '../src/core/vault.js';
import { attachRegistrySource, matchRegistrySkill } from '../src/core/origin.js';
import { mkTmp } from './helpers.js';

const DOC = '---\nname: tdd\ndescription: d\n---\nx';

function searchFetch(skills: unknown[]): typeof fetch {
  return (async () => new Response(JSON.stringify({ skills }), { status: 200 })) as typeof fetch;
}

describe('matchRegistrySkill', () => {
  it('unique when exactly one exact skillId', async () => {
    const r = await matchRegistrySkill(
      'tdd',
      searchFetch([
        { id: 'o/r/tdd', skillId: 'tdd', name: 'tdd', installs: 10, source: 'o/r' },
        { id: 'x/y/tdd-extra', skillId: 'tdd-extra', name: 'tdd-extra', installs: 1, source: 'x/y' },
      ]),
    );
    expect(r).toMatchObject({ kind: 'unique', match: { source: 'o/r' } });
  });

  it('none when no exact skillId', async () => {
    const r = await matchRegistrySkill('nope', searchFetch([{ id: 'o/r/other', skillId: 'other', name: 'o', installs: 1, source: 'o/r' }]));
    expect(r.kind).toBe('none');
  });

  it('ambiguous with multiple exact matches', async () => {
    const r = await matchRegistrySkill(
      'tdd',
      searchFetch([
        { id: 'a/s/tdd', skillId: 'tdd', name: 'tdd', installs: 747, source: 'a/s' },
        { id: 'b/e/tdd', skillId: 'tdd', name: 'tdd', installs: 10, source: 'b/e' },
      ]),
    );
    expect(r.kind).toBe('ambiguous');
    if (r.kind === 'ambiguous') expect(r.candidates).toHaveLength(2);
  });
});

describe('attachRegistrySource', () => {
  it('sets registry source and resolves repo dir', async () => {
    const root = await mkTmp();
    const vault = new Vault(path.join(root, 'vault'));
    const meta = await vault.install('tdd', [{ path: 'SKILL.md', contents: DOC }], { type: 'local' });
    const gh = { findSkillDirs: async () => ['skills/other', 'skills/tdd'] };
    const updated = await attachRegistrySource(vault, gh as any, meta, {
      id: 'o/r/tdd',
      skillId: 'tdd',
      name: 'tdd',
      installs: 10,
      source: 'o/r',
    });
    expect(updated!.source).toMatchObject({ type: 'registry', owner: 'o', repo: 'r', path: 'skills/tdd', skillId: 'tdd' });
    expect((await vault.get('tdd'))!.source.type).toBe('registry');
  });

  it('resolves by frontmatter name when folder name differs from registry slug', async () => {
    const root = await mkTmp();
    const vault = new Vault(path.join(root, 'vault'));
    const meta = await vault.install('vercel-react-best-practices', [{ path: 'SKILL.md', contents: DOC }], {
      type: 'local',
    });
    // repo folder is react-best-practices, but SKILL.md frontmatter name is vercel-react-best-practices
    const gh = {
      findSkillDirs: async () => [
        'skills/composition-patterns',
        'skills/react-best-practices',
        'skills/writing-guidelines',
      ],
      fetchSkillMd: async (_ref: any, dir: string) =>
        dir === 'skills/react-best-practices'
          ? '---\nname: vercel-react-best-practices\ndescription: d\n---\nx'
          : '---\nname: something-else\ndescription: d\n---\nx',
    };
    const updated = await attachRegistrySource(vault, gh as any, meta, {
      id: 'vercel-labs/agent-skills/vercel-react-best-practices',
      skillId: 'vercel-react-best-practices',
      name: 'vercel-react-best-practices',
      installs: 100,
      source: 'vercel-labs/agent-skills',
    });
    expect(updated!.source).toMatchObject({ path: 'skills/react-best-practices', skillId: 'vercel-react-best-practices' });
  });

  it('returns null (and keeps local) when repo HEAD lacks the skill', async () => {
    const root = await mkTmp();
    const vault = new Vault(path.join(root, 'vault'));
    const meta = await vault.install('graphify', [{ path: 'SKILL.md', contents: DOC }], { type: 'local' });
    const gh = { findSkillDirs: async () => [] }; // e.g. graphify-labs/graphify: no SKILL.md anywhere
    const result = await attachRegistrySource(vault, gh as any, meta, {
      id: 'graphify-labs/graphify/graphify',
      skillId: 'graphify',
      name: 'graphify',
      installs: 5537,
      source: 'graphify-labs/graphify',
    });
    expect(result).toBeNull();
    expect((await vault.get('graphify'))!.source.type).toBe('local');
  });
});

