import picocolors from 'picocolors';
import { deploy } from '../core/sync.js';
import { expandHome } from '../core/config.js';
import type { CliCtx } from '../context.js';
import type { CliIo } from '../ui/io.js';

export async function runDeploy(
  io: CliIo,
  ctx: CliCtx,
  opts: { targets?: string[]; yes?: boolean } = {},
): Promise<void> {
  const skills = await ctx.vault.list();
  if (skills.length === 0) {
    io.info('No skills in vault.');
    return;
  }

  const active = ctx.cfg.targets.filter((t) => t.active);
  if (active.length === 0) {
    io.info('No active targets. Run `skillbase targets` first.');
    return;
  }

  let chosenIds: string[];
  if (opts.targets && opts.targets.length > 0) {
    chosenIds = opts.targets;
  } else if (opts.yes) {
    chosenIds = active.map((t) => t.id);
  } else {
    chosenIds = await io.multiselect({
      message: 'Deploy all vault skills to which targets?',
      options: active.map((t) => ({ value: t.id, label: t.name })),
    });
  }

  const chosen = active.filter((t) => chosenIds.includes(t.id));
  if (chosen.length === 0) return;

  const sp = io.spinner();
  sp.start(`Deploying ${skills.length} skill(s) to ${chosen.length} target(s)…`);
  let ok = 0;
  let fail = 0;

  for (const skill of skills) {
    for (const target of chosen) {
      try {
        const res = await deploy(ctx.vault.dirOf(skill.slug), expandHome(target.path), skill.slug);
        const alreadyDeployed = skill.deployments.some((d) => d.targetId === target.id);
        if (!alreadyDeployed) {
          skill.deployments.push({ targetId: target.id, linkPath: res.linkPath, method: res.method });
          await ctx.vault.saveMeta(skill);
        }
        ok++;
      } catch (e) {
        fail++;
        sp.stop();
        io.warn(`Failed ${skill.slug} → ${target.name}: ${(e as Error).message}`);
        sp.start('Continuing…');
      }
    }
  }

  sp.stop();
  io.outro(
    `Deployed ${picocolors.bold(String(ok))} skill-target pair(s)` +
      (fail > 0 ? picocolors.yellow(`, ${fail} failed`) : ''),
  );
}
