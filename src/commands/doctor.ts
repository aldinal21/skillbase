import picocolors from 'picocolors';
import { runChecks, type DoctorIssue } from '../core/doctor.js';
import type { CliCtx } from '../context.js';
import type { CliIo } from '../ui/io.js';

const KIND_LABEL: Record<DoctorIssue['kind'], string> = {
  'hash-mismatch': 'hash mismatch',
  'missing-deployment': 'missing deployment',
  'bad-deployment': 'bad deployment',
  'stale-target': 'stale target',
  unmanaged: 'unmanaged',
};

export async function runDoctor(io: CliIo, ctx: CliCtx): Promise<number> {
  const sp = io.spinner();
  sp.start('Checking vault integrity…');
  let issues: DoctorIssue[];
  try {
    issues = await runChecks(ctx.vault, ctx.cfg);
  } finally {
    sp.stop();
  }

  if (issues.length === 0) {
    io.outro(picocolors.green('All good — vault integrity OK.'));
    return 0;
  }

  const bySlug = new Map<string, DoctorIssue[]>();
  for (const i of issues) {
    const list = bySlug.get(i.slug) ?? [];
    list.push(i);
    bySlug.set(i.slug, list);
  }
  for (const [slug, list] of bySlug) {
    io.info(picocolors.bold(slug));
    for (const i of list) {
      io.error(`  [${KIND_LABEL[i.kind]}] ${i.detail}`);
      if (i.fix) io.info(picocolors.dim(`    → ${i.fix}`));
    }
  }
  io.outro(picocolors.yellow(`${issues.length} issue(s) found across ${bySlug.size} skill(s).`));
  return issues.length;
}
