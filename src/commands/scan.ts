import picocolors from 'picocolors';
import { findUnmanaged, adopt, linkToVault } from '../core/scanner.js';
import type { CliCtx } from '../context.js';
import type { CliIo } from '../ui/io.js';

export interface ScanDeps {
  interactive?: boolean;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

export async function runScan(
  io: CliIo,
  ctx: CliCtx,
  _opts: {} = {},
  deps: ScanDeps = {},
): Promise<void> {
  const interactive = deps.interactive ?? process.stdin.isTTY;
  const sp = io.spinner();
  sp.start('Scanning targets…');
  let found;
  try {
    found = await findUnmanaged(ctx.vault, ctx.cfg.targets);
  } finally {
    sp.stop();
  }
  if (found.length === 0) {
    io.info('No unmanaged skills found.');
    return;
  }

  if (!interactive) {
    io.info(`Found ${found.length} unmanaged skill(s):`);
    for (const u of found) io.info(`  ${u.slugGuess} — ${truncate(u.description, 70)}`);
    io.info(picocolors.dim('Run `skillbase scan` in a terminal to adopt them.'));
    return;
  }

  const selected = await io.multiselect({
    message: 'Adopt which skills into the vault? (space to toggle, enter to confirm)',
    options: found.map((u) => ({
      value: u.slugGuess,
      label: `${u.duplicate ? '[relink] ' : ''}${u.slugGuess} — ${truncate(u.description, 60)}`,
    })),
    initialValues: found.map((u) => u.slugGuess),
  });

  let adopted = 0;
  let relinked = 0;
  for (const u of found.filter((x) => selected.includes(x.slugGuess))) {
    if (u.duplicate) {
      await linkToVault(ctx.vault, u);
      io.info(`Relinked ${picocolors.bold(u.slugGuess)} → vault`);
      relinked++;
    } else {
      await adopt(ctx.vault, u);
      io.info(`Adopted ${picocolors.bold(u.slugGuess)}`);
      adopted++;
    }
  }
  io.outro(`Adopted ${adopted}, relinked ${relinked}, ${found.length - adopted - relinked} left untracked.`);
}
