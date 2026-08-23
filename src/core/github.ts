import type { FetchedFile } from '../types.js';

const API_BASE = 'https://api.github.com';
const RAW_BASE = 'https://raw.githubusercontent.com';

export interface RepoRef {
  owner: string;
  repo: string;
  ref?: string;
  subdir?: string;
}

export interface TreeEntry {
  path: string;
  type: 'blob' | 'tree';
}

export type ParsedInput =
  | { kind: 'github'; repo: RepoRef; skillName?: string }
  | { kind: 'local'; localPath: string };

export function parseSource(input: string): ParsedInput | null {
  const trimmed = input.trim();

  if (/^(\.\/|\.\.\/|~\/|[a-zA-Z]:[\\/]|\/)/.test(trimmed)) {
    return { kind: 'local', localPath: trimmed };
  }

  const urlM = /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/tree\/([^/]+)((?:\/[\w.\-/]+)?))?\/?$/.exec(
    trimmed,
  );
  if (urlM) {
    return {
      kind: 'github',
      repo: {
        owner: urlM[1]!,
        repo: urlM[2]!,
        ...(urlM[3] ? { ref: urlM[3], subdir: urlM[4]?.replace(/^\//, '') } : {}),
      },
      skillName: undefined,
    };
  }

  const sshM = /^git@[^:]+:([^/]+)\/(.+?)(?:\.git)?$/.exec(trimmed);
  if (sshM) return { kind: 'github', repo: { owner: sshM[1]!, repo: sshM[2]! }, skillName: undefined };

  const shortM = /^([\w.-]+)\/([\w.-]+)(?:@([\w.-]+))?$/.exec(trimmed);
  if (shortM) {
    return {
      kind: 'github',
      repo: { owner: shortM[1]!, repo: shortM[2]! },
      skillName: shortM[3],
    };
  }
  return null;
}

const STANDARD_LOCATIONS = ['', 'skills/', '.agents/skills/', 'skills/.curated/', 'skills/.experimental/'];

export class GithubClient {
  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly token?: string,
  ) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      accept: 'application/vnd.github+json',
      'user-agent': 'skillbase-cli',
    };
    if (this.token) h['authorization'] = `Bearer ${this.token}`;
    return h;
  }

  async listTree(ref: RepoRef): Promise<TreeEntry[]> {
    const url = `${API_BASE}/repos/${ref.owner}/${ref.repo}/git/trees/${ref.ref ?? 'HEAD'}?recursive=1`;
    const res = await this.fetchImpl(url, { headers: this.headers() });
    if (!res.ok) throw new Error(`GitHub trees API failed: HTTP ${res.status} for ${ref.owner}/${ref.repo}`);
    const data = (await res.json()) as { tree: TreeEntry[]; truncated: boolean };
    if (data.truncated) throw new Error(`Repository tree too large (truncated): ${ref.owner}/${ref.repo}`);
    return data.tree.filter((e) => e.type === 'blob');
  }

  /** Repo-relative dirs containing SKILL.md ('' = root), depth <= 3, standard locations ranked first. */
  async findSkillDirs(ref: RepoRef): Promise<string[]> {
    const blobs = await this.listTree(ref);
    const base = ref.subdir ? ref.subdir.replace(/\/$/, '') + '/' : '';
    const dirs = new Set<string>();
    for (const b of blobs) {
      if (!(b.path === 'SKILL.md' || b.path.endsWith('/SKILL.md'))) continue;
      if (base && !b.path.startsWith(base)) continue;
      const dir = b.path === 'SKILL.md' ? '' : b.path.slice(0, -'/SKILL.md'.length);
      if (dir !== '' && dir.split('/').length > 3) continue;
      dirs.add(dir);
    }
    const rank = (d: string): number => {
      if (d === '') return -1;
      for (let i = 0; i < STANDARD_LOCATIONS.length; i++) {
        const loc = STANDARD_LOCATIONS[i]!;
        if (loc !== '' && d === loc.slice(0, -1)) return i;
      }
      for (let i = 0; i < STANDARD_LOCATIONS.length; i++) {
        const loc = STANDARD_LOCATIONS[i]!;
        if (loc !== '' && d.startsWith(loc)) return 10 + i;
      }
      return 50;
    };
    return [...dirs].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  }

  private async fetchRaw(ref: RepoRef, path_: string): Promise<string> {
    const url = `${RAW_BASE}/${ref.owner}/${ref.repo}/${ref.ref ?? 'HEAD'}/${path_}`;
    const res = await this.fetchImpl(url, { headers: this.headers() });
    if (!res.ok) throw new Error(`Raw download failed: HTTP ${res.status} for ${path_}`);
    return res.text();
  }

  async downloadDir(ref: RepoRef, dir: string): Promise<FetchedFile[]> {
    const blobs = await this.listTree(ref);
    const prefix = dir === '.' || dir === '' ? '' : dir.replace(/\/$/, '') + '/';
    const under = blobs.filter((b) => b.path.startsWith(prefix));
    if (under.length === 0) throw new Error(`No files found under "${dir}"`);
    const files: FetchedFile[] = [];
    for (let i = 0; i < under.length; i += 8) {
      const batch = under.slice(i, i + 8);
      const parts = await Promise.all(batch.map((b) => this.fetchRaw(ref, b.path)));
      batch.forEach((b, j) => {
        files.push({ path: prefix ? b.path.slice(prefix.length) : b.path, contents: parts[j]! });
      });
    }
    return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  }

  /** List skill names available in a repo (basename of each discovered dir; root skill named after repo). */
  async repoSkills(ref: RepoRef): Promise<Array<{ name: string; dir: string }>> {
    const dirs = await this.findSkillDirs(ref);
    return dirs.map((d) => ({ name: d === '' ? ref.repo : d.split('/').pop()!, dir: d }));
  }
}
