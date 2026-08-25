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

const deps = (gh: any) => ({ search: searchFetch(), gh, interactive: true });

describe('runPin', () => {
  it('multiselects skills, picks candidate and source, keeps content when declining update', async () => {
    const { vault, ctx, gh } = await setup();
    const { io, out } = createTestIo({
      multis: [['tdd']],
      selects: ['a/s/tdd'],
      confirms: [false, false], // update now? no; pin more? no
    });
    await runPin(io, ctx, {}, deps(gh));
    const meta = await vault.get('tdd');
    expect(meta!.source).toMatchObject({ type: 'registry', owner: 'a', repo: 's', skillId: 'tdd' });
    expect(await vault.readFiles('tdd')).toEqual([{ path: 'SKILL.md', contents: OLD_DOC }]);
    expect(out.join('\n')).toMatch(/skillbase update/);
  });

  it('updates to latest when user opts in', async () => {
    const { vault, ctx, gh } = await setup();
    const { io } = createTestIo({
      multis: [['tdd']],
      selects: ['b/e/tdd'],
      confirms: [true, true], // update now? yes; apply? yes
    });
    await runPin(io, ctx, {}, deps(gh));
    const meta = await vault.get('tdd');
    expect(meta!.source).toMatchObject({ owner: 'b', repo: 'e' });
    expect(await vault.readFiles('tdd')).toEqual([{ path: 'SKILL.md', contents: NEW_DOC }]);
  });

  it('explicit slug skips the multiselect', async () => {
    const { vault, ctx, gh } = await setup();
    const { io } = createTestIo({ selects: ['a/s/tdd'], confirms: [false] });
    await runPin(io, ctx, { slug: 'tdd' }, deps(gh));
    expect((await vault.get('tdd'))!.source.type).toBe('registry');
  });

  it('refuses already-tracked skills', async () => {
    const { vault, ctx, gh } = await setup();
    const m = (await vault.get('tdd'))!;
    m.source = { type: 'registry', owner: 'x', repo: 'y', skillId: 'tdd' };
    await vault.saveMeta(m);
    const { io, out } = createTestIo({});
    await runPin(io, ctx, { slug: 'tdd' }, deps(gh));
    expect(out.join('\n')).toMatch(/already linked/i);
  });

  it('skip choice leaves skill untouched and exits without pin-more prompt', async () => {
    const { vault, ctx, gh } = await setup();
    const { io } = createTestIo({ multis: [['tdd']], selects: ['__skip__'] });
    await runPin(io, ctx, {}, deps(gh));
    expect((await vault.get('tdd'))!.source.type).toBe('local');
  });

  it('loops back when user wants to pin more', async () => {
    const root = await mkTmp();
    const vault = new Vault(path.join(root, 'vault'));
    await vault.install('tdd', [{ path: 'SKILL.md', contents: OLD_DOC }], { type: 'local' });
    await vault.install('zdd', [{ path: 'SKILL.md', contents: '---\nname: zdd\ndescription: d\n---\nz' }], {
      type: 'local',
    });
    const cfg: AppConfig = {
      version: 1,
      vaultPath: path.join(root, 'vault'),
      targets: [],
      updateCheck: { intervalHours: 24, lastCheck: null },
    };
    const gh = {
      findSkillDirs: async () => ['skills/x'],
      downloadDir: async () => [{ path: 'SKILL.md', contents: 'x' }],
    } as any;
    const ctx = { cfgPath: path.join(root, 'config.json'), cfg, vault, gh } as any;
    const { io, out } = createTestIo({
      multis: [['tdd'], ['zdd']],
      selects: ['a/s/tdd', 'a/s/zdd'],
      confirms: [false, true, false], // update?no, pin-more?yes, update?no (then all tracked → done)
    });
    await runPin(io, ctx, { }, {
      search: (async (url: any) => {
        const q = decodeURIComponent(String(url).match(/q=([^&]+)/)?.[1] ?? '');
        const skills = q === 'tdd' ? CANDIDATES : [{ id: 'a/s/zdd', skillId: 'zdd', name: 'zdd', installs: 1, source: 'a/s' }];
        return new Response(JSON.stringify({ skills }), { status: 200 });
      }) as typeof fetch,
      gh,
      interactive: true,
    });
    expect((await vault.get('tdd'))!.source.type).toBe('registry');
    expect((await vault.get('zdd'))!.source.type).toBe('registry');
    expect(out.join('\n')).toMatch(/every vault skill is now tracked/i);
  });
});
