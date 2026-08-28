export type SyncMethod = 'symlink' | 'junction' | 'copy';

export interface SkillSource {
  type: 'registry' | 'local';
  owner?: string;
  repo?: string;
  ref?: string;
  path?: string;
  skillId?: string;
}

export interface Deployment {
  targetId: string;
  linkPath: string;
  method: SyncMethod;
}

export interface SkillMeta {
  slug: string;
  name: string;
  description: string;
  source: SkillSource;
  contentHash: string;
  deployments: Deployment[];
  installedAt: string;
  updatedAt: string;
  external?: boolean;
  /** Upstream `name` before namespacing; present only when the frontmatter was rewritten at install time. */
  originalName?: string;
}

export interface FetchedFile {
  path: string;
  contents: string;
}

export interface TargetConfig {
  id: string;
  name: string;
  path: string;
  type: string;
  active: boolean;
}

export interface UpdateCheckConfig {
  intervalHours: number;
  lastCheck: string | null;
}

export interface AppConfig {
  version: 1;
  vaultPath: string;
  targets: TargetConfig[];
  updateCheck: UpdateCheckConfig;
}
