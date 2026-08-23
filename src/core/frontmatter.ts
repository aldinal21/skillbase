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
