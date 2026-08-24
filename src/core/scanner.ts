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
  /** Slug already exists in vault — adoption means replacing this folder/link with a vault link. */
  duplicate?: boolean;
}

async function realpathSafe(p: string): Promise<string | null> {
  try {
    return await fs.realpath(p);
  } catch {
    return null;
  }
}

async function isDirPath(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isDirectory();
  } catch {
    return false;
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
      const dir = path.join(root, ent.name);
      // Real folders and symlinks/junctions to folders both qualify; vault-owned links are skipped.
      const isDir = ent.isDirectory() || (ent.isSymbolicLink() && (await isDirPath(dir)));
      if (!isDir) continue;
      const real = await realpathSafe(dir);
      if (vaultReal && real && (real === vaultReal || real.startsWith(vaultReal + path.sep))) continue;

      let raw: string;
      try {
        raw = await fs.readFile(path.join(dir, 'SKILL.md'), 'utf8');
      } catch {
        continue;
      }
      let parsed;
      try {
        parsed = parseFrontmatter(raw);
      } catch {
        /* invalid frontmatter — not our business */
        continue;
      }
      if (known.has(ent.name)) {
        out.push({
          targetId: t.id,
          dir,
          slugGuess: ent.name,
          name: parsed.name,
          description: parsed.description,
          duplicate: true,
        });
        continue;
      }
      out.push({ targetId: t.id, dir, slugGuess: ent.name, name: parsed.name, description: parsed.description });
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

/** Replace a foreign copy/link of a managed skill with a link into the vault. */
export async function linkToVault(vault: Vault, u: UnmanagedSkill): Promise<SkillMeta | null> {
  const meta = await vault.get(u.slugGuess);
  if (!meta) return null;
  const res = await deploy(vault.dirOf(u.slugGuess), path.dirname(u.dir), u.slugGuess);
  const exists = meta.deployments.some((d) => d.linkPath.toLowerCase() === res.linkPath.toLowerCase());
  if (!exists) {
    meta.deployments.push({ targetId: u.targetId, linkPath: res.linkPath, method: res.method });
    await vault.saveMeta(meta);
  }
  return meta;
}
