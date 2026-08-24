import type { GithubClient } from './github.js';
import { searchSkills, type SearchResult } from './registry.js';
import { Vault } from './vault.js';
import type { SkillMeta } from '../types.js';

export type OriginResult =
  | { kind: 'unique'; match: SearchResult }
  | { kind: 'none' }
  | { kind: 'ambiguous'; candidates: SearchResult[] };

/** Look up a slug on skills.sh with exact-skillId matching. Ambiguous cases are never auto-pinned. */
export async function matchRegistrySkill(slug: string, fetchImpl: typeof fetch = fetch): Promise<OriginResult> {
  const results = await searchSkills(slug, 50, fetchImpl);
  const exact = results.filter((r) => r.skillId === slug);
  if (exact.length === 0) return { kind: 'none' };
  if (exact.length === 1) return { kind: 'unique', match: exact[0]! };
  return { kind: 'ambiguous', candidates: exact };
}

/** Upgrade an adopted (local) skill to registry-tracked: sets source and resolves the repo-internal dir. */
export async function attachRegistrySource(
  vault: Vault,
  gh: Pick<GithubClient, 'findSkillDirs'>,
  meta: SkillMeta,
  match: SearchResult,
): Promise<SkillMeta> {
  const [owner, repo] = match.source.split('/');
  const dirs = await gh.findSkillDirs({ owner: owner!, repo: repo! });
  const dir = dirs.find((d) => d.split('/').pop() === match.skillId) ?? '';
  meta.source = { type: 'registry', owner: owner!, repo: repo!, path: dir, skillId: match.skillId };
  await vault.saveMeta(meta);
  return meta;
}
