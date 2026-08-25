// src/cli.ts
import { Command } from 'commander';
import { clackIo } from './ui/clack-io.js';
import { CancelledError } from './ui/io.js';
import { ensureContext } from './context.js';
import { runList } from './commands/list.js';
import { runFind } from './commands/find.js';
import { runAdd } from './commands/add.js';
import { runTargets } from './commands/targets.js';
import { runUpdate } from './commands/update.js';
import { runRemove } from './commands/remove.js';
import { runScan } from './commands/scan.js';
import { runNew } from './commands/new.js';
import { runConfig } from './commands/config-cmd.js';
import { runMigrate } from './commands/migrate.js';
import { runDoctor } from './commands/doctor.js';
import { maybeCheckForUpdates } from './core/updater.js';

const VERSION = '0.1.0';

export function createProgram(): Command {
  const program = new Command();
  program
    .name('skillbase')
    .description('Vault-based AI agent skill manager')
    .version(VERSION, '-v, --version', 'print version')
    .option('--check', 'force an immediate update check')
    .hook('preAction', async (thisCmd) => {
      const ctx = await ensureContext(clackIo());
      try {
        const n = await maybeCheckForUpdates({
          cfg: ctx.cfg,
          cfgPath: ctx.cfgPath,
          vault: ctx.vault,
          downloadDir: (ref, dir) => ctx.gh.downloadDir(ref, dir),
          force: thisCmd.opts().check === true,
        });
        if (n > 0) clackIo().warn(`⬆ ${n} update(s) available — run 'skillbase update'`);
      } catch {
        /* silent — never disturb the main command */
      }
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

  program
    .command('targets')
    .description('Manage deploy target directories')
    .action(async () => {
      try {
        const ctx = await ensureContext(clackIo());
        await runTargets(clackIo(), ctx);
      } catch (e) {
        if (e instanceof CancelledError) return;
        throw e;
      }
    });

  program
    .command('update')
    .argument('[names...]', 'specific skills to update')
    .option('-a, --all', 'approve every pending update with one confirmation')
    .description('Check for skill updates and apply after review')
    .action(async (names: string[], cmdOpts: { all?: boolean }) => {
      try {
        const ctx = await ensureContext(clackIo());
        await runUpdate(clackIo(), ctx, { names: names.length ? names : undefined, all: cmdOpts.all });
      } catch (e) {
        if (e instanceof CancelledError) return;
        throw e;
      }
    });

  program
    .command('remove')
    .alias('rm')
    .argument('<name>', 'skill slug in the vault')
    .option('--purge', 'also delete the vault copy')
    .option('-t, --targets <ids...>', 'remove only from these target ids')
    .description('Remove a skill from targets (vault copy kept unless --purge)')
    .action(async (name: string, cmdOpts: { purge?: boolean; targets?: string[] }) => {
      try {
        const ctx = await ensureContext(clackIo());
        await runRemove(clackIo(), ctx, { name, ...cmdOpts });
      } catch (e) {
        if (e instanceof CancelledError) return;
        throw e;
      }
    });

  program
    .command('scan')
    .description('Find and adopt unmanaged skills in target directories')
    .action(async () => {
      try {
        const ctx = await ensureContext(clackIo());
        await runScan(clackIo(), ctx, {});
      } catch (e) {
        if (e instanceof CancelledError) return;
        throw e;
      }
    });

  program
    .command('new')
    .argument('[name]', 'skill name (lowercase-hyphenated)')
    .description('Scaffold a new SKILL.md into the vault')
    .action(async (name?: string) => {
      try {
        const ctx = await ensureContext(clackIo());
        await runNew(clackIo(), ctx, { name });
      } catch (e) {
        if (e instanceof CancelledError) return;
        throw e;
      }
    });

  program
    .command('config')
    .argument('[key]', 'vaultPath | intervalHours | disableChecks')
    .argument('[value]', 'new value')
    .description('View or change configuration')
    .action(async (key?: string, value?: string) => {
      try {
        const ctx = await ensureContext(clackIo());
        await runConfig(clackIo(), ctx, { key, value });
      } catch (e) {
        if (e instanceof CancelledError) return;
        throw e;
      }
    });

  program
    .command('migrate')
    .description('One-shot: activate detected agents, adopt all existing skills, relink duplicates')
    .option('--dry-run', 'show what would happen without changing anything')
    .option('-y, --yes', 'skip the confirmation prompt')
    .action(async (cmdOpts: { dryRun?: boolean; yes?: boolean }) => {
      try {
        const ctx = await ensureContext(clackIo());
        await runMigrate(clackIo(), ctx, cmdOpts);
      } catch (e) {
        if (e instanceof CancelledError) return;
        throw e;
      }
    });

  program
    .command('doctor')
    .description('Verify vault integrity (hashes, deployments, orphans)')
    .action(async () => {
      try {
        const ctx = await ensureContext(clackIo());
        const issueCount = await runDoctor(clackIo(), ctx);
        if (issueCount > 0) process.exitCode = 1;
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
