// src/cli.ts
import { Command } from 'commander';

const VERSION = '0.1.0';

export function createProgram(): Command {
  const program = new Command();
  program
    .name('skillbase')
    .description('Vault-based AI agent skill manager')
    .version(VERSION, '-v, --version', 'print version');
  return program;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop()!)) {
  createProgram().parseAsync(process.argv);
}
