import type { FetchedFile } from '../types.js';

export class FrontmatterError extends Error {}

export interface ParsedSkill {
  name: string;
  description: string;
  body: string;
  fields: Record<string, string>;
}

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

function stripQuotes(v: string): string {
  const t = v.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

export function parseFrontmatter(raw: string): ParsedSkill {
  const m = FM_RE.exec(raw);
  if (!m) throw new FrontmatterError('No YAML frontmatter block found (must start with ---)');
  const fields: Record<string, string> = {};
  for (const line of m[1]!.split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i <= 0) continue;
    const key = line.slice(0, i).trim();
    if (!key) continue;
    fields[key] = stripQuotes(line.slice(i + 1));
  }
  const name = fields['name'];
  const description = fields['description'];
  if (!name) throw new FrontmatterError('Frontmatter field "name" is required');
  if (!description) throw new FrontmatterError('Frontmatter field "description" is required');
  return { name, description, body: raw.slice(m[0].length), fields };
}

export function validateSkillFolder(files: FetchedFile[]): { skill: ParsedSkill; supporting: FetchedFile[] } {
  const skillMd = files.filter((f) => f.path === 'SKILL.md' || f.path.endsWith('/SKILL.md'));
  if (skillMd.length !== 1) {
    throw new FrontmatterError(`Expected exactly one SKILL.md, found ${skillMd.length}`);
  }
  const skill = parseFrontmatter(skillMd[0]!.contents);
  const root = skillMd[0]!.path === 'SKILL.md' ? '' : skillMd[0]!.path.slice(0, -'SKILL.md'.length);
  const supporting = files
    .filter((f) => f !== skillMd[0])
    .map((f) => ({
      path: root !== '' && f.path.startsWith(root) ? f.path.slice(root.length) : f.path,
      contents: f.contents,
    }));
  return { skill, supporting };
}

/** Max length for agent-facing skill names (Claude Code and most agents cap at 64). */
const SKILL_NAME_MAX = 64;

/**
 * Normalizes a `<name>-<owner>` candidate into a valid agent skill name:
 * lowercase, `[a-z0-9-]` only, no leading/trailing hyphens, max 64 chars.
 */
export function sanitizeSkillName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+/, '')
    .slice(0, SKILL_NAME_MAX)
    .replace(/-+$/, '');
}

function isSkillMd(f: FetchedFile): boolean {
  return f.path === 'SKILL.md' || f.path.endsWith('/SKILL.md');
}

/**
 * Rewrites the `name:` field of the single SKILL.md to `newName`, leaving every
 * other byte (fields, body, EOL style, nested paths) untouched. Files without a
 * frontmatter block pass through unchanged.
 */
export function rewriteSkillName(files: FetchedFile[], newName: string): FetchedFile[] {
  return files.map((f) => {
    if (!isSkillMd(f)) return f;
    const m = FM_RE.exec(f.contents);
    if (!m) return f;
    const eol = m[1]!.includes('\r\n') ? '\r\n' : '\n';
    let replaced = false;
    const lines = m[1]!.split(/\r?\n/).map((line) => {
      if (replaced) return line;
      const i = line.indexOf(':');
      if (i > 0 && line.slice(0, i).trim() === 'name') {
        replaced = true;
        return `name: ${newName}`;
      }
      return line;
    });
    if (!replaced) return f;
    const closing = /(?:\r?\n)$/.exec(m[0])?.[0] ?? '';
    const head = `---${eol}${lines.join(eol)}${eol}---${closing}`;
    return { ...f, contents: head + f.contents.slice(m.index + m[0].length) };
  });
}
