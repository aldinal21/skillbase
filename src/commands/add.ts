import fs from 'node:fs/promises';
import path from 'node:path';
import picocolors from 'picocolors';
import { expandHome } from '../core/config.js';
import { parseSource, type GithubClient } from '../core/github.js';
import { FrontmatterError, validateSkillFolder } from '../core/frontmatter.js';
import { deploy } from '../core/sync.js';
import { readTree } from '../core/vault.js';
import type { CliCtx } from '../context.js';
import type { CliIo } from '../ui/io.js';
import type { Deployment, FetchedFile, SkillMeta, SkillSource } from '../types.js';

export interface AddDeps {
  gh?: GithubClient;
}

async function uniqueSlug(vault: import('../core/vault.js').Vault, base: string, suffix: string): Promise<string> {
  if (!(await vault.get(base))) return base;
  let candidate = `${base}-${suffix}`;
  let n = 2;
  while (await vault.get(candidate)) candidate = `${base}-${suffix}-${n++}`;
  return candidate;
}

export async function runAdd(
  io: CliIo,
  ctx: CliCtx,
  opts: { source: string; yes?: boolean; targets?: string[] },
  deps: AddDeps = {},
): Promise<SkillMeta | null> {
  const parsed = parseSource(opts.source);
  if (!parsed) {
    io.error(`Cannot parse source "${opts.source}". Use owner/repo@skill, a GitHub URL, or a local path.`);
    return null;
  }

  try {
    let files: FetchedFile[];
    let source: SkillSource;

    if (parsed.kind === 'local') {
      const abs = path.resolve(expandHome(parsed.localPath));
      files = await readTree(abs);
      source = { type: 'local' };
    } else {
      const gh = deps.gh ?? ctx.gh;
      let dir: string;
      if (parsed.skillName) {
        const resolved = (await gh.findSkillDirs(parsed.repo)).find(
          (d) => d.split('/').pop() === parsed.skillName,
        );
        if (resolved === undefined) {
          io.error(`Skill "${parsed.skillName}" not found in ${parsed.repo.owner}/${parsed.repo.repo}`);
          return null;
        }
        dir = resolved;
      } else {
        const skills = await gh.repoSkills(parsed.repo);
        if (skills.length === 0) {
          io.error('No skills found in that repository');
          return null;
        }
        dir =
          skills.length === 1
            ? skills[0]!.dir
            : await io.select({
                message: 'Multiple skills found — select one',
                options: skills.map((s) => ({ value: s.dir, label: s.name })),
              });
      }
      files = await gh.downloadDir(parsed.repo, dir);
      source = {
        type: 'registry',
        owner: parsed.repo.owner,
        repo: parsed.repo.repo,
        ...(parsed.repo.ref ? { ref: parsed.repo.ref } : {}),
        path: dir,
        ...(parsed.skillName ? { skillId: parsed.skillName } : {}),
      };
    }

    const { skill } = validateSkillFolder(files);
    io.info(picocolors.bold(skill.name) + picocolors.dim(` — ${skill.description}`));
    io.info(picocolors.dim(files.map((f) => f.path).join(', ')));

    if (!opts.yes) {
      const ok = await io.confirm({ message: 'Add this skill to the vault?' });
      if (!ok) return null;
    }

    const existing = await ctx.vault.get(skill.name);
    let slug: string;
    if (existing) {
      const overwrite = await io.confirm({ message: `Skill "${skill.name}" already exists — overwrite?` });
      if (overwrite) {
        slug = skill.name;
      } else {
        const suffix = source.type === 'registry' ? source.owner! : 'local';
        slug = await uniqueSlug(ctx.vault, skill.name, suffix);
        io.info(`Using slug ${picocolors.bold(slug)} instead`);
      }
    } else {
      slug = skill.name;
    }

    const meta = await ctx.vault.install(slug, files, source);

    const active = ctx.cfg.targets.filter((t) => t.active);
    let chosenIds: string[] = [];
    if (opts.targets) {
      chosenIds = opts.targets;
    } else if (active.length > 0 && process.stdout.isTTY) {
      chosenIds = await io.multiselect({
        message: 'Deploy to targets',
        options: active.map((t) => ({ value: t.id, label: t.name })),
      });
    }
    const deployments: Deployment[] = [];
    for (const t of ctx.cfg.targets.filter((t) => chosenIds.includes(t.id))) {
      try {
        const res = await deploy(ctx.vault.dirOf(slug), expandHome(t.path), slug);
        deployments.push({ targetId: t.id, linkPath: res.linkPath, method: res.method });
        io.info(`→ ${t.name}: ${res.method}`);
      } catch (e) {
        io.warn(`Failed to deploy to ${t.name}: ${(e as Error).message}`);
      }
    }
    meta.deployments = deployments;
    await ctx.vault.saveMeta(meta);
    io.outro(
      `Added ${picocolors.bold(slug)} to vault${deployments.length ? ` and deployed to ${deployments.length} target(s)` : ''}`,
    );
    return meta;
  } catch (e) {
    if (e instanceof FrontmatterError) {
      io.error(`Invalid SKILL.md: ${e.message}`);
      return null;
    }
    throw e;
  }
}
