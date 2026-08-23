import fs from 'node:fs/promises';
import path from 'node:path';
import type { SyncMethod } from '../types.js';

export interface DeployResult {
  linkPath: string;
  method: SyncMethod;
}

async function isLink(p: string): Promise<boolean> {
  try {
    return (await fs.lstat(p)).isSymbolicLink();
  } catch {
    return false;
  }
}

async function pointsAt(link: string, target: string): Promise<boolean> {
  try {
    return path.resolve(await fs.realpath(link)) === path.resolve(target);
  } catch {
    return false;
  }
}

export async function deploy(skillDir: string, targetPath: string, slug: string): Promise<DeployResult> {
  const linkPath = path.join(targetPath, slug);
  await fs.mkdir(targetPath, { recursive: true });

  if (await isLink(linkPath)) {
    if (await pointsAt(linkPath, skillDir)) {
      return { linkPath, method: process.platform === 'win32' ? 'junction' : 'symlink' };
    }
    await fs.unlink(linkPath);
  } else {
    try {
      await fs.access(linkPath);
      await fs.rm(linkPath, { recursive: true, force: true }); // stale copy/dir we own
    } catch {
      /* does not exist */
    }
  }

  const type = process.platform === 'win32' ? ('junction' as const) : undefined;
  try {
    await fs.symlink(path.resolve(skillDir), linkPath, type);
    return { linkPath, method: type ?? 'symlink' };
  } catch {
    await fs.cp(skillDir, linkPath, { recursive: true });
    return { linkPath, method: 'copy' };
  }
}

export async function removeDeployment(linkPath: string): Promise<void> {
  if (await isLink(linkPath)) {
    await fs.unlink(linkPath);
    return;
  }
  try {
    await fs.access(linkPath);
  } catch {
    return; // already gone
  }
  const marker = path.join(linkPath, 'SKILL.md');
  try {
    await fs.access(marker);
  } catch {
    throw new Error(`Refusing to delete ${linkPath}: not a managed link and has no SKILL.md`);
  }
  await fs.rm(linkPath, { recursive: true, force: true });
}
