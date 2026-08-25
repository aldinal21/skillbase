import type { GithubClient } from './github.js';
import { findDirForSkill } from './github.js';
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

/** Upgrade an adopted (local) skill to registry-tracked. Returns null when the repo HEAD
 * does not actually contain the skill (registry snapshots can outlive repos). */
export async function attachRegistrySource(
  vault: Vault,
  gh: Pick<GithubClient, 'findSkillDirs' | 'fetchSkillMd'>,
  meta: SkillMeta,
  match: SearchResult,
): Promise<SkillMeta | null> {
  const [owner, repo] = match.source.split('/');
  const dir = await findDirForSkill(gh, { owner: owner!, repo: repo! }, match.skillId);
  if (dir === undefined) return null;
  meta.source = { type: 'registry', owner: owner!, repo: repo!, path: dir, skillId: match.skillId };
  await vault.saveMeta(meta);
  return meta;
}
