import picocolors from 'picocolors';
import { applyUpdate, checkUpdates, summarizeChanges, type Downloader } from '../core/updater.js';
import { lineDiff } from '../ui/diff.js';
import type { CliCtx } from '../context.js';
import type { CliIo } from '../ui/io.js';

export interface UpdateDeps {
  downloadDir?: Downloader;
}

export async function runUpdate(
  io: CliIo,
  ctx: CliCtx,
  opts: { names?: string[]; all?: boolean },
  deps: UpdateDeps = {},
): Promise<void> {
  const download: Downloader = deps.downloadDir ?? ((ref, dir) => ctx.gh.downloadDir(ref, dir));

  const sp = io.spinner();
  sp.start('Checking for updates…');
  let candidates;
  try {
    candidates = await checkUpdates(ctx.vault, download, { timeoutMs: 15000 });
  } finally {
    sp.stop();
  }

  if (candidates.length === 0) {
    io.info('Everything up to date.');
    return;
  }

  const wanted =
    opts.all || !opts.names ? candidates : candidates.filter((c) => opts.names!.includes(c.meta.slug));

  if (wanted.length === 0) {
    io.info('No tracked updates for the requested skills.');
    return;
  }

  const approveAll = opts.all === true && (await io.confirm({ message: `Apply ${wanted.length} update(s)?` }));

  for (const cand of wanted) {
    const cur = await ctx.vault.readFiles(cand.meta.slug);
    const s = summarizeChanges(cur, cand.latest);
    const mdCur = cur.find((f) => f.path === 'SKILL.md')?.contents ?? '';
    const mdNew = cand.latest.find((f) => f.path === 'SKILL.md')?.contents ?? '';
    const d = lineDiff(mdCur, mdNew, 40);
    io.info(
      picocolors.bold(cand.meta.slug) +
        picocolors.dim(`  +${s.added.length} ~${s.changed.length} -${s.removed.length} files`),
    );
    for (const l of d.removed) io.info(picocolors.red(`- ${l}`));
    for (const l of d.added) io.info(picocolors.green(`+ ${l}`));
    const ok = approveAll || (await io.confirm({ message: `Update ${cand.meta.slug}?` }));
    if (!ok) continue;
    await applyUpdate(ctx.vault, cand);
    io.info(`Updated ${picocolors.bold(cand.meta.slug)}`);
  }
  io.outro('Update pass complete.');
}
