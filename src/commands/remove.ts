import picocolors from 'picocolors';
import { removeDeployment } from '../core/sync.js';
import type { CliCtx } from '../context.js';
import type { CliIo } from '../ui/io.js';
import type { SkillMeta } from '../types.js';

export async function runRemove(
  io: CliIo,
  ctx: CliCtx,
  opts: { name: string; purge?: boolean; targets?: string[] },
): Promise<SkillMeta | null> {
  const meta = await ctx.vault.get(opts.name);
  if (!meta) {
    io.error(`"${opts.name}" is not in the vault`);
    return null;
  }
  const ids = opts.targets ?? meta.deployments.map((d) => d.targetId);
  for (const dep of meta.deployments.filter((d) => ids.includes(d.targetId))) {
    try {
      await removeDeployment(dep.linkPath);
      io.info(`Removed ${dep.linkPath}`);
    } catch (e) {
      io.warn(`Could not remove ${dep.linkPath}: ${(e as Error).message}`);
    }
  }
  meta.deployments = meta.deployments.filter((d) => !ids.includes(d.targetId));

  if (opts.purge) {
    if (
      meta.deployments.length === 0 ||
      (await io.confirm({ message: 'Still deployed elsewhere — purge anyway?' }))
    ) {
      for (const dep of meta.deployments) {
        try {
          await removeDeployment(dep.linkPath);
        } catch {
          /* reported earlier */
        }
      }
      await ctx.vault.remove(meta.slug);
      io.outro(`Purged ${picocolors.bold(meta.slug)} from vault`);
      return meta;
    }
  }
  await ctx.vault.saveMeta(meta);
  io.outro(`Removed deployments for ${picocolors.bold(meta.slug)} (vault copy kept)`);
  return meta;
}
