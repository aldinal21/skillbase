import picocolors from 'picocolors';
import { findUnmanaged, adopt } from '../core/scanner.js';
import type { CliCtx } from '../context.js';
import type { CliIo } from '../ui/io.js';

export async function runScan(io: CliIo, ctx: CliCtx, _opts: {} = {}): Promise<void> {
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
  for (const u of found) {
    io.info(`${picocolors.bold(u.slugGuess)} — ${u.description}`);
    const ok = await io.confirm({ message: `Adopt "${u.slugGuess}" into the vault?` });
    if (!ok) {
      io.info('Left as external (untracked).');
      continue;
    }
    await adopt(ctx.vault, u);
    io.info(`Adopted ${picocolors.bold(u.slugGuess)}`);
  }
  io.outro('Scan complete.');
}
