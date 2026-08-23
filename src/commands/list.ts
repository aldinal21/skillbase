import fs from 'node:fs/promises';
import picocolors from 'picocolors';
import { renderTable } from '../ui/table.js';
import type { CliCtx } from '../context.js';
import type { CliIo } from '../ui/io.js';

export async function runList(io: CliIo, ctx: CliCtx, _opts: {} = {}): Promise<void> {
  const metas = await ctx.vault.list();
  if (metas.length === 0) {
    io.info(picocolors.dim('No skills in vault yet — try `skillbase find`'));
    return;
  }
  const rows = metas.map((m) => [
    m.slug,
    m.source.type === 'registry' ? `${m.source.owner}/${m.source.repo}` : 'local',
    m.updatedAt.slice(0, 10),
    String(m.deployments.length),
    m.external ? 'external' : m.deployments.length > 0 ? 'deployed' : 'vault-only',
  ]);
  io.info(renderTable(['SLUG', 'SOURCE', 'UPDATED', 'DEPLOYED', 'STATUS'], rows));
  let unmanaged: string[] = [];
  try {
    const entries = await fs.readdir(ctx.vault.root, { withFileTypes: true });
    unmanaged = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .filter((n) => !metas.some((m) => m.slug === n));
  } catch {
    /* empty vault */
  }
  for (const slug of unmanaged) {
    io.warn(`${slug}: unmanaged (missing metadata) — fix with \`skillbase add\``);
  }
}
