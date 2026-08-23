// src/cli.ts
import { Command } from 'commander';
import { clackIo } from './ui/clack-io.js';
import { CancelledError } from './ui/io.js';
import { ensureContext } from './context.js';
import { runList } from './commands/list.js';
import { runFind } from './commands/find.js';
import { runAdd } from './commands/add.js';

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

  program
    .command('find')
    .argument('[query]', 'search the skills.sh registry')
    .description('Search skills.sh for skills')
    .action(async (query?: string) => {
      try {
        const ctx = await ensureContext(clackIo());
        await runFind(clackIo(), ctx, { query });
      } catch (e) {
        if (e instanceof CancelledError) return;
        throw e;
      }
    });

  program
    .command('add')
    .argument('<source>', 'owner/repo@skill | GitHub URL | local path')
    .option('-y, --yes', 'skip confirmation prompts')
    .option('-t, --targets <ids...>', 'deploy to these target ids (non-interactive)')
    .description('Add a skill to the vault (and optionally deploy)')
    .action(async (source: string, cmdOpts: { yes?: boolean; targets?: string[] }) => {
      try {
        const ctx = await ensureContext(clackIo());
        await runAdd(clackIo(), ctx, { source, ...cmdOpts });
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
