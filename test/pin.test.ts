import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { Vault } from '../src/core/vault.js';
import { runPin } from '../src/commands/pin.js';
import { mkTmp, createTestIo } from './helpers.js';
import type { AppConfig } from '../src/types.js';

const OLD_DOC = '---\nname: tdd\ndescription: d\n---\nold';
const NEW_DOC = '---\nname: tdd\ndescription: d\n---\nnew';

const CANDIDATES = [
  { id: 'a/s/tdd', skillId: 'tdd', name: 'tdd', installs: 747, source: 'a/s' },
  { id: 'b/e/tdd', skillId: 'tdd', name: 'tdd', installs: 10, source: 'b/e' },
];

function searchFetch(): typeof fetch {
  return (async () => new Response(JSON.stringify({ skills: CANDIDATES }), { status: 200 })) as typeof fetch;
}

async function setup() {
  const root = await mkTmp();
  const vault = new Vault(path.join(root, 'vault'));
  await vault.install('tdd', [{ path: 'SKILL.md', contents: OLD_DOC }], { type: 'local' });
  const cfg: AppConfig = {
    version: 1,
    vaultPath: path.join(root, 'vault'),
    targets: [],
    updateCheck: { intervalHours: 24, lastCheck: null },
  };
  const gh = {
    findSkillDirs: async () => ['skills/tdd'],
    downloadDir: async () => [{ path: 'SKILL.md', contents: NEW_DOC }],
  } as any;
  return { vault, ctx: { cfgPath: path.join(root, 'config.json'), cfg, vault, gh } as any, gh };
}

describe('runPin', () => {
  it('lists local skills, lets user pick candidate and source, without updating', async () => {
    const { vault, ctx, gh } = await setup();
    const { io, out } = createTestIo({
      selects: ['tdd', 'a/s/tdd'], // pick skill, then pick source candidate
      confirms: [false], // update now? no
    });
    await runPin(io, ctx, {}, { search: searchFetch(), gh, interactive: true });
    const meta = await vault.get('tdd');
    expect(meta!.source).toMatchObject({ type: 'registry', owner: 'a', repo: 's', skillId: 'tdd' });
    expect(await vault.readFiles('tdd')).toEqual([{ path: 'SKILL.md', contents: OLD_DOC }]); // untouched
    expect(out.join('\n')).toMatch(/skillbase update/i);
  });

  it('updates to latest when user opts in', async () => {
    const { vault, ctx, gh } = await setup();
    const { io } = createTestIo({ selects: ['tdd', 'b/e/tdd'], confirms: [true, true] });
    await runPin(io, ctx, {}, { search: searchFetch(), gh, interactive: true });
    const meta = await vault.get('tdd');
    expect(meta!.source).toMatchObject({ owner: 'b', repo: 'e' });
    expect(await vault.readFiles('tdd')).toEqual([{ path: 'SKILL.md', contents: NEW_DOC }]);
  });

  it('explicit slug argument skips the skill picker', async () => {
    const { vault, ctx, gh } = await setup();
    const { io } = createTestIo({ selects: ['a/s/tdd'], confirms: [false] });
    await runPin(io, ctx, { slug: 'tdd' }, { search: searchFetch(), gh, interactive: true });
    expect((await vault.get('tdd'))!.source.type).toBe('registry');
  });

  it('refuses already-tracked skills', async () => {
    const { vault, ctx, gh } = await setup();
    await vault.get('tdd')!.then(async (m) => {
      m!.source = { type: 'registry', owner: 'x', repo: 'y', skillId: 'tdd' };
      await vault.saveMeta(m!);
    });
    const { io, out } = createTestIo({});
    await runPin(io, ctx, { slug: 'tdd' }, { search: searchFetch(), gh, interactive: true });
    expect(out.join('\n')).toMatch(/already tracked/i);
  });

  it('skip choice leaves skill untouched', async () => {
    const { vault, ctx, gh } = await setup();
    const { io } = createTestIo({ selects: ['tdd', '__skip__'] });
    await runPin(io, ctx, {}, { search: searchFetch(), gh, interactive: true });
    expect((await vault.get('tdd'))!.source.type).toBe('local');
  });
});
