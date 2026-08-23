// src/cli.ts
import { Command } from 'commander';
import { clackIo } from './ui/clack-io.js';
import { CancelledError } from './ui/io.js';
import { ensureContext } from './context.js';
import { runList } from './commands/list.js';

const VERSION = '0.1.0';

export function createProgram(): Command {
  const program = new Command();
  program
    .name('skillbase')
    .description('Vault-based AI agent skill manager')
    .version(VERSION, '-v, --version', 'print version')
    .hook('preAction', async () => {
      await ensureContext(clackIo());
    });

  program
    .command('list')
    .alias('ls')
    .description('List skills in the vault')
    .action(async () => {
      try {
        const ctx = await ensureContext(clackIo());
        await runList(clackIo(), ctx, {});
      } catch (e) {
        if (e instanceof CancelledError) return;
        throw e;
      }
    });

  return program;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop()!)) {
  createProgram().parseAsync(process.argv);
}
