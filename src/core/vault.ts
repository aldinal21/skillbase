import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { FetchedFile, SkillMeta, SkillSource } from '../types.js';
import { validateSkillFolder } from './frontmatter.js';

export const META_FILE = 'skillbase.meta.json';

function byPath(a: { path: string }, b: { path: string }): number {
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}

export async function hashSkillFiles(files: FetchedFile[]): Promise<string> {
  const sorted = [...files].sort(byPath);
  const payload = sorted.map((f) => `${f.path}\n${f.contents}`).join('\n');
  return `sha256-${createHash('sha256').update(payload).digest('hex')}`;
}

/** Rejects absolute paths and any path escaping `dir`. Runs before any content validation. */
function assertSafePaths(dir: string, files: FetchedFile[]): void {
  const root = path.resolve(dir);
  for (const f of files) {
    if (path.isAbsolute(f.path) || !path.resolve(root, f.path).startsWith(root + path.sep)) {
      throw new Error(`Refusing path traversal outside vault entry: ${f.path}`);
    }
  }
}

async function writeTree(dir: string, files: FetchedFile[]): Promise<void> {
  for (const f of files) {
    const dest = path.resolve(dir, f.path);
    if (!dest.startsWith(path.resolve(dir) + path.sep)) {
      throw new Error(`Refusing path traversal outside vault entry: ${f.path}`);
    }
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, f.contents, 'utf8');
  }
}

export async function readTree(dir: string, rel = ''): Promise<FetchedFile[]> {
  const out: FetchedFile[] = [];
  for (const ent of await fs.readdir(path.join(dir, rel), { withFileTypes: true })) {
    const relPath = rel ? `${rel}/${ent.name}` : ent.name;
    if (ent.isDirectory()) out.push(...(await readTree(dir, relPath)));
    else if (ent.isFile() && ent.name !== META_FILE) {
      out.push({ path: relPath, contents: await fs.readFile(path.join(dir, relPath), 'utf8') });
    }
  }
  return out.sort(byPath);
}

export class Vault {
  constructor(readonly root: string) {}

  dirOf(slug: string): string {
    return path.join(this.root, slug);
  }

  async list(): Promise<SkillMeta[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.root);
    } catch {
      return [];
    }
    const metas: SkillMeta[] = [];
    for (const e of entries) {
      const m = await this.get(e);
      if (m) metas.push(m);
    }
    return metas.sort((a, b) => a.slug.localeCompare(b.slug));
  }

  metaPath(slug: string): string {
    return path.join(this.dirOf(slug), META_FILE);
  }

  async get(slug: string): Promise<SkillMeta | null> {
    try {
      return JSON.parse(await fs.readFile(this.metaPath(slug), 'utf8')) as SkillMeta;
    } catch {
      return null;
    }
  }

  async saveMeta(meta: SkillMeta): Promise<void> {
    await fs.mkdir(this.dirOf(meta.slug), { recursive: true });
    await fs.writeFile(this.metaPath(meta.slug), JSON.stringify(meta, null, 2) + '\n', 'utf8');
  }

  async readFiles(slug: string): Promise<FetchedFile[]> {
    return readTree(this.dirOf(slug));
  }

  async hashOf(slug: string): Promise<string> {
    return hashSkillFiles(await this.readFiles(slug));
  }

  async install(
    slug: string,
    files: FetchedFile[],
    source: SkillSource,
    originalName?: string,
  ): Promise<SkillMeta> {
    const dir = this.dirOf(slug);
    assertSafePaths(dir, files);
    const { skill } = validateSkillFolder(files);
    await fs.rm(dir, { recursive: true, force: true });
    await fs.mkdir(dir, { recursive: true });
    await writeTree(dir, files);
    const now = new Date().toISOString();
    const meta: SkillMeta = {
      slug,
      name: skill.name,
      description: skill.description,
      source,
      contentHash: await hashSkillFiles(files),
      deployments: [],
      installedAt: now,
      updatedAt: now,
      ...(originalName ? { originalName } : {}),
    };
    await this.saveMeta(meta);
    return meta;
  }

  async replaceContents(slug: string, files: FetchedFile[]): Promise<SkillMeta> {
    const meta = await this.get(slug);
    if (!meta) throw new Error(`Skill "${slug}" not found in vault`);
    const dir = this.dirOf(slug);
    assertSafePaths(dir, files);
    const { skill } = validateSkillFolder(files);
    for (const ent of await fs.readdir(dir)) {
      if (ent !== META_FILE) await fs.rm(path.join(dir, ent), { recursive: true, force: true });
    }
    await writeTree(dir, files);
    meta.name = skill.name;
    meta.description = skill.description;
    meta.contentHash = await hashSkillFiles(files);
    meta.updatedAt = new Date().toISOString();
    await this.saveMeta(meta);
    return meta;
  }

  async remove(slug: string): Promise<void> {
    await fs.rm(this.dirOf(slug), { recursive: true, force: true });
  }
}
