import picocolors from 'picocolors';
import { addTargetById, detectInstalledPresets, type AgentPreset } from '../core/targets.js';
import { saveConfig } from '../core/config.js';
import { findUnmanaged, adopt, linkToVault } from '../core/scanner.js';
import { matchRegistrySkill, attachRegistrySource, type OriginResult } from '../core/origin.js';
import { renderTable } from '../ui/table.js';
import type { CliCtx } from '../context.js';
import type { CliIo } from '../ui/io.js';
import type { SkillMeta } from '../types.js';

export interface MigrateOpts {
  dryRun?: boolean;
  yes?: boolean;
}

export interface MigrateDeps {
  interactive?: boolean;
  /** fetch impl for registry origin lookups */
  search?: typeof fetch;
  gh?: CliCtx['gh'];
  detectPresets?: typeof detectInstalledPresets;
}

export async function runMigrate(
  io: CliIo,
  ctx: CliCtx,
  opts: MigrateOpts = {},
  deps: MigrateDeps = {},
): Promise<void> {
  const gh = deps.gh ?? ctx.gh;
  const detect = deps.detectPresets ?? detectInstalledPresets;
  const interactive = deps.interactive ?? Boolean(process.stdin.isTTY);

  // 1. Activate every detected agent preset as a target
  const installed: AgentPreset[] = await detect();
  const activated: string[] = [];
  for (const p of installed) {
    if (!ctx.cfg.targets.some((t) => t.id === `${p.key}-global`)) {
      ctx.cfg = addTargetById(ctx.cfg, p);
      activated.push(p.name);
    }
  }
  if (activated.length > 0 && !opts.dryRun) await saveConfig(ctx.cfg, ctx.cfgPath);

  // 2. Find unmanaged skills + foreign duplicates across all active targets
  const found = await findUnmanaged(ctx.vault, ctx.cfg.targets);
  const fresh = found.filter((u) => !u.duplicate);
  const dups = found.filter((u) => u.duplicate);

  // 3. Dry run: plan only
  if (opts.dryRun) {
    io.info(
      activated.length > 0
        ? `Would activate targets: ${activated.join(', ')}`
        : 'No new targets to activate',
    );
    io.info(`Would adopt ${fresh.length} skill(s):`);
    for (const u of fresh) io.info(`  + ${u.slugGuess} — ${u.description.slice(0, 60)}`);
    io.info(`Would relink ${dups.length} duplicate(s):`);
    for (const u of dups) io.info(`  ~ ${u.slugGuess} → vault`);
    return;
  }

  if (found.length === 0 && activated.length === 0) {
    io.info('Nothing to migrate — no new targets, no unmanaged skills.');
    return;
  }

  // 4. Single confirmation
  if (!opts.yes && interactive) {
    const ok = await io.confirm({
      message: `Migrate: activate ${activated.length} target(s), adopt ${fresh.length}, relink ${dups.length}. Continue?`,
    });
    if (!ok) return;
  }

  // 5. Execute
  const sp = io.spinner();
  sp.start('Migrating…');
  let relinked = 0;
  const adoptedMetas: Array<{ slug: string; meta: SkillMeta }> = [];
  for (const u of fresh) {
    const meta = await adopt(ctx.vault, u);
    adoptedMetas.push({ slug: u.slugGuess, meta });
  }
  for (const u of dups) {
    await linkToVault(ctx.vault, u);
    relinked++;
  }
  sp.stop();

  // 6. Origin detection: link adopted skills to the registry when unambiguous
  let tracked = 0;
  let local = 0;
  const ambiguous: Array<{ slug: string; candidates: string[] }> = [];
  for (const { slug, meta } of adoptedMetas) {
    sp.start(`Checking registry: ${slug}…`);
    let origin: OriginResult;
    try {
      origin = await matchRegistrySkill(slug, deps.search ?? fetch);
    } catch {
      origin = { kind: 'none' };
    }
    if (origin.kind === 'unique') {
      await attachRegistrySource(ctx.vault, gh, meta, origin.match);
      tracked++;
    } else if (origin.kind === 'ambiguous') {
      ambiguous.push({
        slug,
        candidates: origin.candidates.map((c) => `${c.source}@${c.skillId} (${c.installs} installs)`),
      });
      local++;
    } else {
      local++;
    }
  }
  sp.stop();

  // 7. Report
  io.info(
    renderTable(['OUTCOME', 'COUNT'], [
      ['Targets activated', String(activated.length)],
      ['Adopted + tracked', String(tracked)],
      ['Adopted + local', String(local)],
      ['Duplicates relinked', String(relinked)],
    ]),
  );
  for (const a of ambiguous) {
    io.warn(`Ambiguous "${picocolors.bold(a.slug)}" — pin one with: skillbase add <owner/repo@${a.slug}>`);
    for (const c of a.candidates) io.info(`    ${picocolors.dim(c)}`);
  }
  io.outro('Migration complete.');
}
