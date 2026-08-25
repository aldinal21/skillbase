import picocolors from 'picocolors';
import { searchSkills, type SearchResult } from '../core/registry.js';
import { attachRegistrySource } from '../core/origin.js';
import { applyUpdate, summarizeChanges } from '../core/updater.js';
import { lineDiff } from '../ui/diff.js';
import { formatInstalls } from '../ui/format.js';
import type { CliCtx } from '../context.js';
import type { CliIo } from '../ui/io.js';
import type { SkillMeta } from '../types.js';

export interface PinDeps {
  interactive?: boolean;
  search?: typeof fetch;
  gh?: CliCtx['gh'];
}

type PinResult = 'linked' | 'skipped' | 'failed';

export async function runPin(
  io: CliIo,
  ctx: CliCtx,
  opts: { slug?: string },
  deps: PinDeps = {},
): Promise<void> {
  const interactive = deps.interactive ?? Boolean(process.stdin.isTTY);
  const gh = deps.gh ?? ctx.gh;

  // Explicit slug: single pass, no loop
  if (opts.slug) {
    await pinOne(io, ctx, gh, opts.slug, 1, 1, deps, interactive);
    return;
  }

  if (!interactive) {
    io.error('Non-interactive usage: skillbase pin <slug>');
    return;
  }

  for (;;) {
    const locals = (await ctx.vault.list()).filter((m) => m.source.type === 'local' && !m.external);
    if (locals.length === 0) {
      io.outro('All vault skills are tracked to skills.sh — nothing left to pin.');
      return;
    }
    const picked = await io.multiselect({
      message: `Pin which skill(s)? (${locals.length} untracked)`,
      options: locals.map((m) => ({ value: m.slug, label: `${m.slug} — ${m.description.slice(0, 60)}` })),
    });
    if (picked.length === 0) {
      io.info('Nothing selected — done.');
      return;
    }
    let linked = 0;
    for (let i = 0; i < picked.length; i++) {
      const res = await pinOne(io, ctx, gh, picked[i]!, i + 1, picked.length, deps, interactive);
      if (res === 'linked') linked++;
    }
    if (linked === 0) {
      io.info('Nothing linked — done.');
      return;
    }
    const remaining = (await ctx.vault.list()).filter((m) => m.source.type === 'local' && !m.external).length;
    if (remaining === 0) {
      io.outro(picocolors.green('Done — every vault skill is now tracked to skills.sh.'));
      return;
    }
    if (!(await io.confirm({ message: `Pin more? (${remaining} untracked left)` }))) {
      io.outro(`Done — ${linked} skill(s) linked this session.`);
      return;
    }
  }
}

async function pinOne(
  io: CliIo,
  ctx: CliCtx,
  gh: NonNullable<PinDeps['gh']> | CliCtx['gh'],
  slug: string,
  index: number,
  total: number,
  deps: PinDeps,
  interactive: boolean,
): Promise<PinResult> {
  const prefix = total > 1 ? picocolors.dim(`[${index}/${total}] `) : '';
  const meta = await ctx.vault.get(slug);
  if (!meta) {
    io.error(`${prefix}"${slug}" is not in the vault`);
    return 'failed';
  }
  if (meta.source.type !== 'local') {
    io.info(`${prefix}${picocolors.bold(slug)} ${picocolors.green('✓')} already linked to ${meta.source.owner}/${meta.source.repo}`);
    return 'skipped';
  }

  const sp = io.spinner();
  sp.start(`${prefix}Searching skills.sh for "${slug}"…`);
  let results: SearchResult[] = [];
  try {
    results = await searchSkills(slug, 50, deps.search ?? fetch);
  } catch {
    /* handled below */
  } finally {
    sp.stop();
  }
  if (results.length === 0) {
    io.warn(`${prefix}No candidates for "${slug}" on skills.sh — staying local.`);
    return 'skipped';
  }

  const SKIP = '__skip__';
  const picked = await io.select({
    message: `${prefix}Which one is "${slug}"?`,
    options: [
      ...results.map((r) => ({
        value: r.id,
        label: `${r.source}@${r.skillId}${formatInstalls(r.installs) ? ` (${formatInstalls(r.installs)})` : ''}`,
      })),
      { value: SKIP, label: 'None of these — keep it local' },
    ],
  });
  if (picked === SKIP) {
    io.info(`${prefix}Kept ${picocolors.bold(slug)} as local.`);
    return 'skipped';
  }
  const chosen = results.find((r) => r.id === picked)!;
  let updated: SkillMeta | null = null;
  try {
    updated = await attachRegistrySource(ctx.vault, gh, meta, chosen);
  } catch {
    updated = null;
  }
  if (!updated) {
    io.warn(
      `${prefix}Repo ${picocolors.bold(chosen.source)} has no "${chosen.skillId}" folder at HEAD — cannot track updates. Kept local.`,
    );
    return 'skipped';
  }
  io.info(
    `${prefix}${picocolors.green('✓')} ${picocolors.bold(slug)} → ${chosen.source}@${chosen.skillId} — now covered by 'skillbase update'`,
  );

  if (interactive && (await io.confirm({ message: 'Update to the latest version now?' }))) {
    try {
      await offerUpdate(io, ctx, gh, updated);
    } catch (e) {
      io.error(`Update failed, skill stays linked: ${(e as Error).message}`);
    }
  }
  return 'linked';
}

async function offerUpdate(
  io: CliIo,
  ctx: CliCtx,
  gh: NonNullable<PinDeps['gh']> | CliCtx['gh'],
  meta: SkillMeta,
): Promise<void> {
  const dir = await gh
    .findSkillDirs({ owner: meta.source.owner!, repo: meta.source.repo! })
    .then((dirs) => dirs.find((d) => d.split('/').pop() === meta.source.skillId))
    .catch(() => undefined);
  const files = await gh.downloadDir(
    { owner: meta.source.owner!, repo: meta.source.repo! },
    dir ?? meta.source.path ?? '.',
  );
  const cur = await ctx.vault.readFiles(meta.slug);
  const s = summarizeChanges(cur, files);
  io.info(picocolors.dim(`Changes: +${s.added.length} ~${s.changed.length} -${s.removed.length} files`));
  const mdCur = cur.find((f) => f.path === 'SKILL.md')?.contents ?? '';
  const mdNew = files.find((f) => f.path === 'SKILL.md')?.contents ?? '';
  const d = lineDiff(mdCur, mdNew, 30);
  for (const l of d.removed) io.info(picocolors.red(`- ${l}`));
  for (const l of d.added) io.info(picocolors.green(`+ ${l}`));
  if (await io.confirm({ message: 'Apply this update?' })) {
    await applyUpdate(ctx.vault, { meta, latest: files, latestHash: meta.contentHash });
    io.outro(`Updated ${picocolors.bold(meta.slug)} to latest.`);
  } else {
    io.info('Kept current content — diff will show up in skillbase update.');
  }
}
