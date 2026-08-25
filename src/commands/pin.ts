import picocolors from 'picocolors';
import { searchSkills, type SearchResult } from '../core/registry.js';
import { attachRegistrySource } from '../core/origin.js';
import { applyUpdate, summarizeChanges } from '../core/updater.js';
import { lineDiff } from '../ui/diff.js';
import { formatInstalls } from '../ui/format.js';
import type { CliCtx } from '../context.js';
import type { CliIo } from '../ui/io.js';

export interface PinDeps {
  interactive?: boolean;
  search?: typeof fetch;
  gh?: CliCtx['gh'];
}

export async function runPin(
  io: CliIo,
  ctx: CliCtx,
  opts: { slug?: string },
  deps: PinDeps = {},
): Promise<void> {
  const interactive = deps.interactive ?? Boolean(process.stdin.isTTY);
  const gh = deps.gh ?? ctx.gh;

  const locals = (await ctx.vault.list()).filter((m) => m.source.type === 'local' && !m.external);
  if (!opts.slug && locals.length === 0) {
    io.info('No local (untracked) skills in the vault.');
    return;
  }

  // 1. Pick the skill (unless slug given)
  let slug = opts.slug;
  if (!slug) {
    if (!interactive) {
      io.error('Non-interactive usage: skillbase pin <slug>');
      return;
    }
    slug = await io.select({
      message: 'Which local skill do you want to link to skills.sh?',
      options: locals.map((m) => ({ value: m.slug, label: `${m.slug} — ${m.description.slice(0, 60)}` })),
    });
  }
  const meta = await ctx.vault.get(slug);
  if (!meta) {
    io.error(`"${slug}" is not in the vault`);
    return;
  }
  if (meta.source.type !== 'local') {
    io.error(`"${slug}" is already tracked (${meta.source.owner}/${meta.source.repo})`);
    return;
  }

  // 2. Search registry and show ALL candidates for the user to judge
  const sp = io.spinner();
  sp.start(`Searching skills.sh for "${slug}"…`);
  let results: SearchResult[] = [];
  try {
    results = await searchSkills(slug, 50, deps.search ?? fetch);
  } catch {
    /* handled below */
  } finally {
    sp.stop();
  }
  if (results.length === 0) {
    io.warn(`No candidates found for "${slug}" on skills.sh — staying local.`);
    return;
  }
  if (!interactive) {
    io.error('Candidate picking needs a terminal — run `skillbase pin` interactively.');
    return;
  }

  const SKIP = '__skip__';
  const picked = await io.select({
    message: `Which one is "${slug}"?`,
    options: [
      ...results.map((r) => ({
        value: r.id,
        label: `${r.source}@${r.skillId}${formatInstalls(r.installs) ? ` (${formatInstalls(r.installs)})` : ''}`,
      })),
      { value: SKIP, label: 'None of these — keep it local' },
    ],
  });
  if (picked === SKIP) {
    io.info('Left as local.');
    return;
  }
  const chosen = results.find((r) => r.id === picked)!;

  // 3. Attach source
  const updated = await attachRegistrySource(ctx.vault, gh, meta, chosen);
  io.info(
    `Linked ${picocolors.bold(slug)} → ${chosen.source}@${chosen.skillId} — now covered by 'skillbase update'`,
  );

  // 4. Optional immediate update
  if (interactive && (await io.confirm({ message: 'Update to the latest version now?' }))) {
    const dir = await gh
      .findSkillDirs({ owner: updated.source.owner!, repo: updated.source.repo! })
      .then((dirs) => dirs.find((d) => d.split('/').pop() === updated.source.skillId))
      .catch(() => undefined);
    const files = await gh.downloadDir(
      { owner: updated.source.owner!, repo: updated.source.repo! },
      dir ?? updated.source.path ?? '.',
    );
    const cur = await ctx.vault.readFiles(slug);
    const s = summarizeChanges(cur, files);
    io.info(picocolors.dim(`Changes: +${s.added.length} ~${s.changed.length} -${s.removed.length} files`));
    const mdCur = cur.find((f) => f.path === 'SKILL.md')?.contents ?? '';
    const mdNew = files.find((f) => f.path === 'SKILL.md')?.contents ?? '';
    const d = lineDiff(mdCur, mdNew, 30);
    for (const l of d.removed) io.info(picocolors.red(`- ${l}`));
    for (const l of d.added) io.info(picocolors.green(`+ ${l}`));
    if (await io.confirm({ message: 'Apply this update?' })) {
      await applyUpdate(ctx.vault, { meta: updated, latest: files, latestHash: updated.contentHash });
      io.outro(`Updated ${picocolors.bold(slug)} to latest.`);
      return;
    }
    io.info('Kept current content — diff will show up in skillbase update.');
  }
}
