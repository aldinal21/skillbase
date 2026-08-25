import path from 'node:path';
import { saveConfig } from './config.js';
import { deploy } from './sync.js';
import { Vault, hashSkillFiles } from './vault.js';
import type { AppConfig, FetchedFile, SkillMeta } from '../types.js';

export interface UpdateCandidate {
  meta: SkillMeta;
  latest: FetchedFile[];
  latestHash: string;
}

/** Structural seam over GithubClient.downloadDir — keeps this module network-free and stubbable. */
export type Downloader = (
  repoRef: { owner: string; repo: string; ref?: string },
  dir: string,
) => Promise<FetchedFile[]>;

function timeoutRace<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error('update check timed out')), ms)),
  ]);
}

function refOf(meta: SkillMeta): { owner: string; repo: string; ref?: string } {
  return {
    owner: meta.source.owner!,
    repo: meta.source.repo!,
    ...(meta.source.ref ? { ref: meta.source.ref } : {}),
  };
}

export async function checkUpdates(
  vault: Vault,
  downloadDir: Downloader,
  opts: { timeoutMs?: number } = {},
): Promise<UpdateCandidate[]> {
  const all = await vault.list();
  const tracked = all.filter((m) => m.source.type === 'registry' && !m.external);
  const timeoutMs = opts.timeoutMs ?? 2000;
  const jobs = tracked.map(async (meta) => {
    const latest = await downloadDir(refOf(meta), meta.source.path ?? '.');
    // Source anomaly guard: upstream snapshot without a SKILL.md is not a skill — skip it.
    const hasSkillMd = latest.some((f) => f.path === 'SKILL.md' || f.path.endsWith('/SKILL.md'));
    if (!hasSkillMd) return null;
    const latestHash = await hashSkillFiles(latest);
    if (latestHash === meta.contentHash) return null;
    return { meta, latest, latestHash } satisfies UpdateCandidate;
  });
  const settled = await Promise.allSettled(jobs.map((p) => timeoutRace(p, timeoutMs)));
  return settled
    .filter((s): s is PromiseFulfilledResult<UpdateCandidate | null> => s.status === 'fulfilled' && s.value !== null)
    .map((s) => s.value!);
}

export function summarizeChanges(current: FetchedFile[], latest: FetchedFile[]) {
  const curMap = new Map(current.map((f) => [f.path, f.contents]));
  const latMap = new Map(latest.map((f) => [f.path, f.contents]));
  const added = [...latMap.keys()].filter((p) => !curMap.has(p));
  const removed = [...curMap.keys()].filter((p) => !latMap.has(p));
  const changed = [...latMap.keys()].filter((p) => curMap.has(p) && curMap.get(p) !== latMap.get(p));
  return { added, removed, changed };
}

export async function applyUpdate(vault: Vault, cand: UpdateCandidate): Promise<SkillMeta> {
  const meta = await vault.replaceContents(cand.meta.slug, cand.latest);
  for (const dep of meta.deployments) {
    if (dep.method === 'copy') {
      await deploy(vault.dirOf(meta.slug), path.dirname(dep.linkPath), meta.slug);
    }
  }
  return meta;
}

export async function maybeCheckForUpdates(args: {
  cfg: AppConfig;
  cfgPath: string;
  vault: Vault;
  downloadDir: Downloader;
  force?: boolean;
}): Promise<number> {
  const { cfg, cfgPath, vault, downloadDir, force } = args;
  const last = cfg.updateCheck.lastCheck ? Date.parse(cfg.updateCheck.lastCheck) : 0;
  const stale = Date.now() - last > cfg.updateCheck.intervalHours * 3600_000;
  if (!force && !stale) return 0;
  let count = 0;
  try {
    count = (await checkUpdates(vault, downloadDir, { timeoutMs: 2000 })).length;
  } catch {
    /* silent */
  }
  cfg.updateCheck.lastCheck = new Date().toISOString();
  try {
    await saveConfig(cfg, cfgPath);
  } catch {
    /* non-fatal */
  }
  return count;
}
