import { describe, expect, it } from 'vitest';
import { FrontmatterError, parseFrontmatter, validateSkillFolder } from '../src/core/frontmatter.js';

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
