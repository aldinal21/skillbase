import picocolors from 'picocolors';
import type { GithubClient, RepoRef } from '../core/github.js';
import { findDirForSkill } from '../core/github.js';
import { RegistryError, searchSkills, type SearchResult } from '../core/registry.js';
import { formatInstalls } from '../ui/format.js';
import { renderTable } from '../ui/table.js';
import type { CliCtx } from '../context.js';
import type { CliIo } from '../ui/io.js';

export interface FindDeps {
  search?: typeof searchSkills;
  gh?: GithubClient;
}

export async function resolveSkillDir(
  gh: Pick<GithubClient, 'findSkillDirs' | 'fetchSkillMd'>,
  ref: RepoRef,
  skillName: string,
): Promise<string | null> {
  return (await findDirForSkill(gh, ref, skillName)) ?? null;
}

export async function runFind(
  io: CliIo,
  _ctx: CliCtx,
  opts: { query?: string },
  deps: FindDeps = {},
): Promise<void> {
  const search = deps.search ?? searchSkills;

  if (!process.stdout.isTTY || opts.query !== undefined) {
    const q = opts.query;
    if (!q) {
      io.error('Non-interactive usage: skillbase find <query>');
      return;
    }
    let results: SearchResult[];
    try {
      results = await search(q);
    } catch (e) {
      io.error(e instanceof RegistryError ? `Registry error: HTTP ${e.status}` : 'Search failed — check your connection');
      return;
    }
    if (results.length === 0) {
      io.info(picocolors.dim(`No skills found for "${q}"`));
      return;
    }
    io.info(
      renderTable(
        ['INSTALL WITH', 'INSTALLS'],
        results.map((r) => [`${r.source}@${r.skillId}`, formatInstalls(r.installs)]),
      ),
    );
    io.info(picocolors.dim('Install with: skillbase add <owner/repo@skill>'));
    return;
  }

  // Interactive
  const query = await io.text({ message: 'Search skills (min 2 chars):' });
  if (!query || query.length < 2) return;
  const sp = io.spinner();
  sp.start('Searching…');
  let results: SearchResult[] = [];
  try {
    results = await search(query);
  } catch {
    /* fallthrough */
  } finally {
    sp.stop();
  }
  if (results.length === 0) {
    io.info(picocolors.dim('No skills found'));
    return;
  }
  const picked = await io.select({
    message: 'Select skill',
    options: results.map((r) => ({ value: r.id, label: r.name })),
  });
  const chosen = results.find((r) => r.id === picked)!;
  const gh = deps.gh ?? _ctx.gh;
  let preview = '(preview unavailable)';
  try {
    const [owner, repo] = chosen.source.split('/');
    const dir = await resolveSkillDir(gh, { owner: owner!, repo: repo! }, chosen.skillId);
    if (dir !== null) {
      const files = await gh.downloadDir({ owner: owner!, repo: repo! }, dir);
      const md = files.find((f) => f.path.endsWith('SKILL.md'));
      if (md) preview = md.contents.split('\n').slice(0, 40).join('\n');
    }
  } catch {
    /* preview best-effort */
  }
  io.info(picocolors.bold(preview));
  io.info(picocolors.dim(`Install with: skillbase add ${chosen.source}@${chosen.skillId}`));
}
