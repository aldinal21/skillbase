import { describe, expect, it } from 'vitest';
import {
  FrontmatterError,
  parseFrontmatter,
  rewriteSkillName,
  sanitizeSkillName,
  validateSkillFolder,
} from '../src/core/frontmatter.js';
import type { FetchedFile } from '../src/types.js';

const doc = [
  '---',
  'name: tdd',
  'description: "Test driven dev, use when writing code"',
  'license: MIT',
  '---',
  '',
  '# TDD',
  'body here',
].join('\n');

describe('parseFrontmatter', () => {
  it('parses name/description/body and extra fields', () => {
    const p = parseFrontmatter(doc);
    expect(p.name).toBe('tdd');
    expect(p.description).toBe('Test driven dev, use when writing code');
    expect(p.fields['license']).toBe('MIT');
    expect(p.body).toContain('# TDD');
  });

  it('accepts CRLF', () => {
    expect(parseFrontmatter(doc.replace(/\n/g, '\r\n')).name).toBe('tdd');
  });

  it('throws without frontmatter block', () => {
    expect(() => parseFrontmatter('# just markdown')).toThrow(FrontmatterError);
  });

  it('throws when name or description missing', () => {
    const bad = '---\nname: x\n---\nbody';
    expect(() => parseFrontmatter(bad)).toThrow(FrontmatterError);
  });
});

describe('sanitizeSkillName', () => {
  it('lowercases and hyphenates author suffix', () => {
    expect(sanitizeSkillName('TDD-MattPocock')).toBe('tdd-mattpocock');
    expect(sanitizeSkillName('test driven_dev.mattpocock')).toBe('test-driven-dev-mattpocock');
  });

  it('strips illegal characters and trims hyphens', () => {
    expect(sanitizeSkillName('--My__Skill!!--')).toBe('my-skill');
    expect(sanitizeSkillName('***')).toBe('');
  });

  it('caps at 64 chars without trailing hyphen', () => {
    const long = sanitizeSkillName(`${'a'.repeat(70)}-b`);
    expect(long.length).toBeLessThanOrEqual(64);
    expect(long.endsWith('-')).toBe(false);
  });
});

describe('rewriteSkillName', () => {
  const files: FetchedFile[] = [
    { path: 'SKILL.md', contents: doc },
    { path: 'refs/a.md', contents: 'x' },
  ];

  it('rewrites only the name field, preserving everything else', () => {
    const out = rewriteSkillName(files, 'tdd-mattpocock');
    expect(out).toHaveLength(2);
    expect(out[1]).toBe(files[1]);
    expect(parseFrontmatter(out[0]!.contents).name).toBe('tdd-mattpocock');
    expect(out[0]!.contents).toContain('description: "Test driven dev, use when writing code"');
    expect(out[0]!.contents).toContain('# TDD');
  });

  it('replaces an existing suffixed name instead of appending', () => {
    const once = rewriteSkillName(files, 'tdd-a');
    const twice = rewriteSkillName(once, 'tdd-b');
    expect(parseFrontmatter(twice[0]!.contents).name).toBe('tdd-b');
  });

  it('preserves CRLF line endings', () => {
    const crlf: FetchedFile[] = [{ path: 'SKILL.md', contents: doc.replace(/\n/g, '\r\n') }];
    const out = rewriteSkillName(crlf, 'tdd-x');
    expect(out[0]!.contents).toContain('\r\n');
    expect(parseFrontmatter(out[0]!.contents).name).toBe('tdd-x');
  });

  it('leaves files without frontmatter untouched', () => {
    const plain: FetchedFile[] = [{ path: 'SKILL.md', contents: '# no frontmatter' }];
    expect(rewriteSkillName(plain, 'tdd-x')).toEqual(plain);
  });
});

describe('validateSkillFolder', () => {
  it('rejects zero or multiple SKILL.md', () => {
    expect(() => validateSkillFolder([])).toThrow(FrontmatterError);
    expect(() =>
      validateSkillFolder([
        { path: 'SKILL.md', contents: doc },
        { path: 'sub/SKILL.md', contents: doc },
      ]),
    ).toThrow(FrontmatterError);
  });

  it('splits supporting files', () => {
    const r = validateSkillFolder([
      { path: 'SKILL.md', contents: doc },
      { path: 'refs/a.md', contents: 'x' },
    ]);
    expect(r.supporting).toHaveLength(1);
    expect(r.skill.name).toBe('tdd');
  });
});
