import { Vault } from '../core/vault.js';
import type { CliCtx } from '../context.js';
import type { CliIo } from '../ui/io.js';
import type { SkillMeta } from '../types.js';

export async function runNew(io: CliIo, ctx: CliCtx, opts: { name?: string } = {}): Promise<SkillMeta | undefined> {
  const name = opts.name ?? (await io.text({ message: 'Skill name (lowercase-hyphenated):' }));
  if (!name || !/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    io.error('Name must be lowercase letters, numbers and hyphens');
    return undefined;
  }
  const contents = [
    '---',
    `name: ${name}`,
    'description: Describe what this skill does and when to use it',
    '---',
    '',
    `# ${name}`,
    '',
    '## When to Use',
    '',
    'Describe trigger scenarios.',
    '',
    '## Steps',
    '',
    '1. First…',
    '',
  ].join('\n');
  const meta = await ctx.vault.install(name, [{ path: 'SKILL.md', contents }], { type: 'local' });
  io.outro(`Created ${meta.slug} in vault — edit ${ctx.vault.dirOf(name)}/SKILL.md`);
  return meta;
}
