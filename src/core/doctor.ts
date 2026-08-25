import fs from 'node:fs/promises';
import path from 'node:path';
import { Vault } from './vault.js';
import type { AppConfig } from '../types.js';

export type IssueKind =
  | 'hash-mismatch'
  | 'missing-deployment'
  | 'bad-deployment'
  | 'stale-target'
  | 'unmanaged';

export interface DoctorIssue {
  slug: string;
  kind: IssueKind;
  detail: string;
  fix?: string;
}

export async function runChecks(vault: Vault, cfg: AppConfig): Promise<DoctorIssue[]> {
  const issues: DoctorIssue[] = [];
  const metas = await vault.list();
  const knownTargets = new Set(cfg.targets.map((t) => t.id));

  for (const meta of metas) {
    // 1. content hash vs meta
    try {
      const actual = await vault.hashOf(meta.slug);
      if (actual !== meta.contentHash) {
        issues.push({
          slug: meta.slug,
          kind: 'hash-mismatch',
          detail: 'content edited in place after install',
          fix: "re-run 'skillbase add' to re-baseline, or 'skillbase update' if registry-sourced",
        });
      }
    } catch {
      issues.push({
        slug: meta.slug,
        kind: 'hash-mismatch',
        detail: 'content unreadable',
        fix: "re-run 'skillbase add'",
      });
    }

    // 2. deployments exist and look like skills
    for (const dep of meta.deployments) {
      if (!knownTargets.has(dep.targetId)) {
        issues.push({
          slug: meta.slug,
          kind: 'stale-target',
          detail: `deployment references unknown target "${dep.targetId}"`,
          fix: "re-add the target via 'skillbase targets' or remove the deployment",
        });
      }
      let st;
      try {
        st = await fs.lstat(dep.linkPath);
      } catch {
        issues.push({
          slug: meta.slug,
          kind: 'missing-deployment',
          detail: `${dep.linkPath} is gone (target ${dep.targetId})`,
          fix: "re-deploy with 'skillbase migrate' or 'skillbase add'",
        });
        continue;
      }
      if (!st.isSymbolicLink()) {
        let hasMarker = false;
        try {
          await fs.access(path.join(dep.linkPath, 'SKILL.md'));
          hasMarker = true;
        } catch {
          /* no marker */
        }
        if (!hasMarker) {
          issues.push({
            slug: meta.slug,
            kind: 'bad-deployment',
            detail: `${dep.linkPath} exists but is not a skill link/folder`,
            fix: 'remove the stray folder, then re-deploy',
          });
        }
      }
    }
  }

  // 3. vault folders without metadata
  try {
    const entries = await fs.readdir(vault.root, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.isDirectory() && !metas.some((m) => m.slug === ent.name)) {
        issues.push({
          slug: ent.name,
          kind: 'unmanaged',
          detail: 'folder in vault without skillbase.meta.json',
          fix: "re-run 'skillbase add' on it to adopt, or delete the folder",
        });
      }
    }
  } catch {
    /* empty vault */
  }

  return issues;
}
