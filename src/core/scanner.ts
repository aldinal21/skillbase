import fs from 'node:fs/promises';
import path from 'node:path';
import { parseFrontmatter } from './frontmatter.js';
import { deploy } from './sync.js';
import { readTree, Vault } from './vault.js';
import { expandHome } from './config.js';
import type { FetchedFile, SkillMeta, TargetConfig } from '../types.js';

export interface UnmanagedSkill {
  targetId: string;
  dir: string;
  slugGuess: string;
  name: string;
  description: string;
}

async function realpathSafe(p: string): Promise<string | null> {
  try {
    return await fs.realpath(p);
  } catch {
    return null;
  }
}

export async function findUnmanaged(vault: Vault, targets: TargetConfig[], home?: string): Promise<UnmanagedSkill[]> {
  const expand = home ? (p: string) => (p.startsWith('~') ? path.join(home, p.slice(1)) : p) : expandHome;
  const known = new Set((await vault.list()).map((m) => m.slug));
  const vaultReal = await realpathSafe(vault.root);
  const out: UnmanagedSkill[] = [];

  for (const t of targets.filter((x) => x.active)) {
    const root = expand(t.path);
    let entries;
    try {
      entries = await fs.readdir(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const dir = path.join(root, ent.name);
      const real = await realpathSafe(dir);
      if (vaultReal && real && (real === vaultReal || real.startsWith(vaultReal + path.sep))) continue;
      let raw: string;
      try {
        raw = await fs.readFile(path.join(dir, 'SKILL.md'), 'utf8');
      } catch {
        continue;
      }
      if (known.has(ent.name)) continue;
      try {
        const parsed = parseFrontmatter(raw);
        out.push({ targetId: t.id, dir, slugGuess: ent.name, name: parsed.name, description: parsed.description });
      } catch {
        /* invalid frontmatter — not our business */
      }
    }
  }
  return out;
}

export async function adopt(vault: Vault, u: UnmanagedSkill): Promise<SkillMeta> {
  const files: FetchedFile[] = await readTree(u.dir);
  const meta = await vault.install(u.slugGuess, files, { type: 'local' });
  const res = await deploy(vault.dirOf(u.slugGuess), path.dirname(u.dir), u.slugGuess);
  meta.deployments.push({ targetId: u.targetId, linkPath: res.linkPath, method: res.method });
  await vault.saveMeta(meta);
  return meta;
}
