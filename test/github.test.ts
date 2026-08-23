import { describe, expect, it } from 'vitest';
import { GithubClient, parseSource } from '../src/core/github.js';
import type { TreeEntry } from '../src/core/github.js';

describe('parseSource', () => {
  it('parses shorthand forms', () => {
    expect(parseSource('vercel-labs/skills@find-skills')).toEqual({
      kind: 'github',
      repo: { owner: 'vercel-labs', repo: 'skills' },
      skillName: 'find-skills',
    });
    expect(parseSource('vercel-labs/agent-skills')).toEqual({
      kind: 'github',
      repo: { owner: 'vercel-labs', repo: 'agent-skills' },
      skillName: undefined,
    });
  });

  it('parses repo and tree URLs', () => {
    expect(parseSource('https://github.com/o/r')).toEqual({
      kind: 'github',
      repo: { owner: 'o', repo: 'r' },
      skillName: undefined,
    });
    expect(parseSource('https://github.com/o/r/tree/main/skills/foo')).toEqual({
      kind: 'github',
      repo: { owner: 'o', repo: 'r', ref: 'main', subdir: 'skills/foo' },
      skillName: undefined,
    });
  });

  it('parses local paths and rejects garbage', () => {
    expect(parseSource('./my-skill')).toEqual({ kind: 'local', localPath: './my-skill' });
    expect(parseSource('C:\\tmp\\skill')).toEqual({ kind: 'local', localPath: 'C:\\tmp\\skill' });
    expect(parseSource('justaword')).toBeNull();
  });
});

const tree: TreeEntry[] = [
  { path: 'README.md', type: 'blob' },
  { path: 'SKILL.md', type: 'blob' },
  { path: 'skills/foo/SKILL.md', type: 'blob' },
  { path: 'skills/foo/refs/a.md', type: 'blob' },
  { path: '.agents/skills/bar/SKILL.md', type: 'blob' },
];

function ghWithTree(entries: TreeEntry[], files?: Record<string, string>): GithubClient {
  const impl = (async (url: any) => {
    const u = String(url);
    if (u.includes('/git/trees/')) {
      return new Response(JSON.stringify({ tree: entries, truncated: false }), { status: 200 });
    }
    for (const [p, c] of Object.entries(files ?? {})) {
      if (u.endsWith(`/${p}`)) return new Response(c, { status: 200 });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
  return new GithubClient(impl);
}

describe('GithubClient', () => {
  it('lists skill dirs, root first then standard locations', async () => {
    const gh = ghWithTree(tree);
    const dirs = await gh.findSkillDirs({ owner: 'o', repo: 'r' });
    expect(dirs[0]).toBe('');
    expect(dirs).toContain('skills/foo');
    expect(dirs).toContain('.agents/skills/bar');
    expect(dirs.indexOf('skills/foo')).toBeLessThan(dirs.indexOf('.agents/skills/bar'));
  });

  it('with subdir filter returns full repo-relative dirs under it', async () => {
    const gh = ghWithTree(tree);
    const dirs = await gh.findSkillDirs({ owner: 'o', repo: 'r', subdir: 'skills/foo' });
    expect(dirs).toEqual(['skills/foo']);
  });

  it('downloads all files under a dir', async () => {
    const gh = ghWithTree(tree, {
      'skills/foo/SKILL.md': '---\nname: foo\ndescription: d\n---\nx',
      'skills/foo/refs/a.md': 'A',
    });
    const files = await gh.downloadDir({ owner: 'o', repo: 'r' }, 'skills/foo');
    expect(files).toHaveLength(2);
    expect(files[0]).toEqual({ path: 'SKILL.md', contents: expect.stringContaining('name: foo') });
  });

  it('throws on truncated tree', async () => {
    const impl = (async () =>
      new Response(JSON.stringify({ tree: [], truncated: true }), { status: 200 })) as typeof fetch;
    const gh = new GithubClient(impl);
    await expect(gh.listTree({ owner: 'o', repo: 'r' })).rejects.toThrow(/truncated/i);
  });
});
