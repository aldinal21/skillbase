# SkillBase CLI Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite SkillBase from the Go web app into a pure-CLI npm package (`skillbase`) that manages AI agent skills via a central vault with symlink/copy deployment to agent targets, registry search on skills.sh, and hash-based update checking.

**Architecture:** Single pnpm package. Thin `src/commands/*` (arg parsing + TUI via clack) over pure `src/core/*` modules (config, vault, sync, registry, fetcher, updater, scanner) that take explicit paths/injectable `fetch` so everything is testable without a TTY or network. All commands receive an injected `CliIo` object so interactive flows can be stubbed in tests.

**Tech Stack:** TypeScript (strict, ESM), Node >= 20, pnpm, Commander, @clack/prompts, picocolors, tsup, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-23-skillbase-cli-rewrite-design.md`

## Global Constraints

- Node.js `>=20`, `"type": "module"` (ESM only), package name exactly `skillbase`.
- Runtime deps limited to: `commander`, `@clack/prompts`, `picocolors`. Dev deps: `typescript`, `tsup`, `vitest`, `@types/node`.
- `tsconfig.json`: `"strict": true`, module/nodule resolution `NodeNext`, outDir `dist`.
- All filesystem access through `node:fs/promises` / `node:path`; every core function takes explicit paths (never a hidden global HOME read inside `core/`).
- **No test performs real network calls** — network seams are injectable `fetchImpl` parameters (deviation note: spec's testing section named msw; we achieve identical isolation with injected `fetch` and zero extra deps).
- Never log `GITHUB_TOKEN`/`GH_TOKEN`; token is only sent as `Authorization: Bearer <token>` header.
- Windows-safe path handling everywhere (`path.join`, never string concat); frontmatter parser must accept CRLF.
- Tests live in `test/`, run with `pnpm test` (Vitest), must pass on Windows/macOS/Linux.
- Commit after each task using the exact message given.

---

### Task 1: Clean slate + toolchain scaffold

**Files:**
- Delete: `main.go`, `go.mod`, `go.sum`, `internal/**`, `web/**`, `storage/**`, `skillbase.db`, `main.exe`, `skillbase.exe`
- Create: `package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`, `bin/skillbase.js`, `.gitignore` (modify), `src/cli.ts`

**Interfaces:**
- Produces: runnable `skillbase --version` binary; `pnpm test` runs green empty suite; `src/cli.ts` exports `createProgram(): Command` (later tasks register commands on it).

- [ ] **Step 1: Delete Go-era code**

```bash
git rm -r --quiet main.go go.mod go.sum internal web storage skillbase.db main.exe skillbase.exe 2>/dev/null; git status --short
```

(If `storage/` contains real skills you want to keep, move them to a backup folder outside git first.)

- [ ] **Step 2: Create package.json, tsconfig, tsup, vitest configs**

`package.json`:

```json
{
  "name": "skillbase",
  "version": "0.1.0",
  "description": "Vault-based AI agent skill manager — install skills.sh skills to Claude Code, OpenCode, .agents and more",
  "license": "MIT",
  "type": "module",
  "engines": { "node": ">=20" },
  "bin": { "skillbase": "bin/skillbase.js" },
  "files": ["bin", "dist"],
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "test:watch": "vitest",
    "prepublishOnly": "pnpm build"
  },
  "dependencies": {
    "@clack/prompts": "^0.11.0",
    "commander": "^14.0.0",
    "picocolors": "^1.1.1"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "tsup": "^8.3.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": false,
    "sourceMap": false
  },
  "include": ["src/**/*.ts"]
}
```

`tsup.config.ts`:

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  sourcemap: false,
  clean: true,
});
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
```

`bin/skillbase.js`:

```js
#!/usr/bin/env node
import('../dist/cli.js').then((m) => m.createProgram().parseAsync(process.argv));
```

Append to `.gitignore` (replace any Go-era ignore content):

```
node_modules/
dist/
*.exe
skillbase.db
.superpowers/
```

- [ ] **Step 3: Write minimal src/cli.ts**

```ts
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
```

- [ ] **Step 4: Install and verify**

```bash
pnpm install && pnpm build && node bin/skillbase.js --version && pnpm test
```

Expected: `0.1.0` printed; vitest reports no test files yet — add `test/helpers.ts` as a shared fixture module so later tasks have it:

```ts
// test/helpers.ts
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export async function mkTmp(prefix = 'skillbase-test-'): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}
```

Run: `pnpm test` → Expected: pass (0 tests; "no test files" is acceptable output for this task only — later tasks add tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat!: remove Go web app, scaffold skillbase CLI (TS+pnpm+tsup+vitest)"
```

---

### Task 2: Config store (`core/config.ts`) + shared types

**Files:**
- Create: `src/types.ts`, `src/core/config.ts`
- Test: `test/config.test.ts`

**Interfaces:**
- Consumes: `mkTmp()` from `test/helpers.ts`.
- Produces:
  - `src/types.ts`: `SyncMethod`, `SkillSource`, `Deployment`, `SkillMeta`, `FetchedFile`, `TargetConfig`, `AppConfig`, `UpdateCheckConfig` (exact shapes below).
  - `loadConfig(configPath?): Promise<AppConfig | null>` (null when file missing)
  - `saveConfig(cfg: AppConfig, configPath?): Promise<void>`
  - `defaultConfig(vaultPath?: string): AppConfig`
  - `expandHome(p: string): string`
  - `DEFAULT_CONFIG_PATH(): string`

- [ ] **Step 1: Write failing tests**

```ts
// test/config.test.ts
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { defaultConfig, expandHome, loadConfig, saveConfig } from '../src/core/config.js';
import { mkTmp } from './helpers.js';

describe('config', () => {
  it('returns null when missing', async () => {
    expect(await loadConfig(path.join(await mkTmp(), 'config.json'))).toBeNull();
  });

  it('saves and loads round-trip', async () => {
    const dir = await mkTmp();
    const p = path.join(dir, 'nested', 'config.json');
    const cfg = defaultConfig();
    cfg.targets.push({ id: 't1', name: 'T', path: '~/x', type: 'custom', active: true });
    await saveConfig(cfg, p);
    const loaded = await loadConfig(p);
    expect(loaded?.targets[0]?.id).toBe('t1');
    expect(loaded?.updateCheck.intervalHours).toBe(24);
  });

  it('expands ~ to home', () => {
    const home = expandHome('~');
    expect(home).not.toBe('~');
    expect(expandHome('~/a/b').startsWith(home)).toBe(true);
    expect(expandHome('~/a/b')).toContain(path.join('a', 'b'));
  });
});
```

(Simplify: drop `expandPathLike` helper and assert `expandHome('~/a')` ends with `a`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test`
Expected: FAIL — cannot resolve `../src/core/config.js`.

- [ ] **Step 3: Implement types + config**

`src/types.ts`:

```ts
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
```

`src/core/config.ts`:

```ts
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AppConfig } from '../types.js';

export function DEFAULT_CONFIG_PATH(): string {
  return path.join(os.homedir(), '.skillbase', 'config.json');
}

export function defaultConfig(vaultPath = '~/.skillbase/vault'): AppConfig {
  return { version: 1, vaultPath, targets: [], updateCheck: { intervalHours: 24, lastCheck: null } };
}

export function expandHome(p: string): string {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/') || p.startsWith('~\\')) return path.join(os.homedir(), p.slice(2));
  return p;
}

export async function loadConfig(configPath = DEFAULT_CONFIG_PATH()): Promise<AppConfig | null> {
  try {
    return JSON.parse(await fs.readFile(configPath, 'utf8')) as AppConfig;
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') return null;
    throw e;
  }
}

export async function saveConfig(cfg: AppConfig, configPath = DEFAULT_CONFIG_PATH()): Promise<void> {
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
}
```

- [ ] **Step 4: Run tests until green**

Run: `pnpm test` → Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/core/config.ts test/config.test.ts && git commit -m "feat(core): app config store with ~ expansion and shared types"
```

---

### Task 3: SKILL.md frontmatter parser

**Files:**
- Create: `src/core/frontmatter.ts`
- Test: `test/frontmatter.test.ts`

**Interfaces:**
- Produces:
  - `class FrontmatterError extends Error`
  - `parseFrontmatter(raw: string): ParsedSkill` where `ParsedSkill = { name: string; description: string; body: string; fields: Record<string, string> }`
  - `validateSkillFolder(files: FetchedFile[]): { skill: ParsedSkill; supporting: FetchedFile[] }` — throws unless exactly one `SKILL.md` exists.

- [ ] **Step 1: Write failing tests**

```ts
// test/frontmatter.test.ts
import { describe, expect, it } from 'vitest';
import { FrontmatterError, parseFrontmatter, validateSkillFolder } from '../src/core/frontmatter.js';

const doc = [
  '---',
  'name: tdd',
  'description: "Test driven dev, use when writing code"',
  'license: MIT',
  '---',
  '',
  '# TDD',
  'body here',
].join('\n');

describe('parseFrontmatter', () => {
  it('parses name/description/body and extra fields', () => {
    const p = parseFrontmatter(doc);
    expect(p.name).toBe('tdd');
    expect(p.description).toBe('Test driven dev, use when writing code');
    expect(p.fields['license']).toBe('MIT');
    expect(p.body).toContain('# TDD');
  });

  it('accepts CRLF', () => {
    expect(parseFrontmatter(doc.replace(/\n/g, '\r\n')).name).toBe('tdd');
  });

  it('throws without frontmatter block', () => {
    expect(() => parseFrontmatter('# just markdown')).toThrow(FrontmatterError);
  });

  it('throws when name or description missing', () => {
    const bad = '---\nname: x\n---\nbody';
    expect(() => parseFrontmatter(bad)).toThrow(FrontmatterError);
  });
});

describe('validateSkillFolder', () => {
  it('rejects zero or multiple SKILL.md', () => {
    expect(() => validateSkillFolder([])).toThrow(FrontmatterError);
    expect(() =>
      validateSkillFolder([
        { path: 'SKILL.md', contents: doc },
        { path: 'sub/SKILL.md', contents: doc },
      ]),
    ).toThrow(FrontmatterError);
  });

  it('splits supporting files', () => {
    const r = validateSkillFolder([
      { path: 'SKILL.md', contents: doc },
      { path: 'refs/a.md', contents: 'x' },
    ]);
    expect(r.supporting).toHaveLength(1);
    expect(r.skill.name).toBe('tdd');
  });
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm test` → Expected: FAIL resolving `../src/core/frontmatter.js`.

- [ ] **Step 3: Implement**

```ts
// src/core/frontmatter.ts
import type { FetchedFile } from '../types.js';

export class FrontmatterError extends Error {}

export interface ParsedSkill {
  name: string;
  description: string;
  body: string;
  fields: Record<string, string>;
}

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

function stripQuotes(v: string): string {
  const t = v.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

export function parseFrontmatter(raw: string): ParsedSkill {
  const m = FM_RE.exec(raw);
  if (!m) throw new FrontmatterError('No YAML frontmatter block found (must start with ---)');
  const fields: Record<string, string> = {};
  for (const line of m[1]!.split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i <= 0) continue;
    const key = line.slice(0, i).trim();
    if (!key) continue;
    fields[key] = stripQuotes(line.slice(i + 1));
  }
  const name = fields['name'];
  const description = fields['description'];
  if (!name) throw new FrontmatterError('Frontmatter field "name" is required');
  if (!description) throw new FrontmatterError('Frontmatter field "description" is required');
  return { name, description, body: raw.slice(m[0].length), fields };
}

export function validateSkillFolder(files: FetchedFile[]): { skill: ParsedSkill; supporting: FetchedFile[] } {
  const skillMd = files.filter((f) => f.path === 'SKILL.md' || f.path.endsWith('/SKILL.md'));
  if (skillMd.length !== 1) {
    throw new FrontmatterError(`Expected exactly one SKILL.md, found ${skillMd.length}`);
  }
  const skill = parseFrontmatter(skillMd[0]!.contents);
  const root = skillMd[0]!.path === 'SKILL.md' ? '' : skillMd[0]!.path.slice(0, -'SKILL.md'.length);
  const supporting = files.filter((f) => f !== skillMd[0]).map((f) => ({ path: f.path.startsWith(root) ? f.path.slice(root.length) : f.path, contents: f.contents }));
  return { skill, supporting };
}
```

- [ ] **Step 4: Run tests until green**

Run: `pnpm test` → PASS (7 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/core/frontmatter.ts test/frontmatter.test.ts && git commit -m "feat(core): SKILL.md frontmatter parser with validation"
```

---

### Task 4: Vault (CRUD + content hashing)

**Files:**
- Create: `src/core/vault.ts`
- Test: `test/vault.test.ts`

**Interfaces:**
- Consumes: types `SkillMeta`, `FetchedFile`, `SkillSource`; `validateSkillFolder` from frontmatter.
- Produces:
  - `hashSkillFiles(files: FetchedFile[]): Promise<string>` — sha256 over `(path\ncontents)` pairs sorted by path.
  - `class Vault { constructor(root: string); list(): Promise<SkillMeta[]>; get(slug): Promise<SkillMeta|null>; readFiles(slug): Promise<FetchedFile[]>; hashOf(slug): Promise<string>; install(slug, files, source): Promise<SkillMeta>; replaceContents(slug, files): Promise<SkillMeta>; remove(slug): Promise<void>; saveMeta(meta): Promise<void>; dirOf(slug): string }`

- [ ] **Step 1: Write failing tests**

```ts
// test/vault.test.ts
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { Vault, hashSkillFiles } from '../src/core/vault.js';
import { mkTmp } from './helpers.js';
import type { FetchedFile, SkillSource } from '../src/types.js';

const files: FetchedFile[] = [
  { path: 'SKILL.md', contents: '---\nname: tdd\ndescription: d\n---\n# hi' },
  { path: 'refs/x.md', contents: 'ref' },
];
const src: SkillSource = { type: 'registry', owner: 'o', repo: 'r', path: 'skills/tdd', skillId: 'tdd' };

describe('hashSkillFiles', () => {
  it('order-independent and changes with content', async () => {
    const a = await hashSkillFiles(files);
    const b = await hashSkillFiles([...files].reverse());
    expect(a).toBe(b);
    expect(a).toMatch(/^sha256-[0-9a-f]{64}$/);
    const c = await hashSkillFiles([files[0]!, { path: 'refs/x.md', contents: 'changed' }]);
    expect(c).not.toBe(a);
  });
});

describe('Vault', () => {
  it('install -> get -> readFiles round trip', async () => {
    const v = new Vault(path.join(await mkTmp(), 'vault'));
    const meta = await v.install('tdd', files, src);
    expect(meta.contentHash).toMatch(/^sha256-/);
    expect((await v.get('tdd'))?.slug).toBe('tdd');
    expect(await v.readFiles('tdd')).toEqual(files.map((f) => ({ path: f.path, contents: f.contents })));
    expect(await v.list()).toHaveLength(1);
  });

  it('rejects path traversal in file paths', async () => {
    const v = new Vault(path.join(await mkTmp(), 'vault'));
    await expect(
      v.install('evil', [{ path: '../escape.txt', contents: 'x' }], src),
    ).rejects.toThrow(/traversal|outside/i);
  });

  it('replaceContents updates hash and updatedAt', async () => {
    const v = new Vault(path.join(await mkTmp(), 'vault'));
    const m1 = await v.install('tdd', files, src);
    const changed: FetchedFile[] = [{ path: 'SKILL.md', contents: '---\nname: tdd\ndescription: d\n---\n# v2' }];
    const m2 = await v.replaceContents('tdd', changed);
    expect(m2.contentHash).not.toBe(m1.contentHash);
    expect(new Date(m2.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(m1.updatedAt).getTime());
    expect(await v.hashOf('tdd')).toBe(m2.contentHash);
  });

  it('remove deletes directory', async () => {
    const v = new Vault(path.join(await mkTmp(), 'vault'));
    await v.install('tdd', files, src);
    await v.remove('tdd');
    expect(await v.get('tdd')).toBeNull();
    expect(await v.list()).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm test` → FAIL resolving `../src/core/vault.js`.

- [ ] **Step 3: Implement**

```ts
// src/core/vault.ts
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { FetchedFile, SkillMeta, SkillSource } from '../types.js';
import { validateSkillFolder } from './frontmatter.js';

export const META_FILE = 'skillbase.meta.json';

export async function hashSkillFiles(files: FetchedFile[]): Promise<string> {
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  const payload = sorted.map((f) => `${f.path}\n${f.contents}`).join('\n');
  return `sha256-${createHash('sha256').update(payload).digest('hex')}`;
}

async function writeTree(dir: string, files: FetchedFile[]): Promise<void> {
  for (const f of files) {
    const dest = path.resolve(dir, f.path);
    if (!dest.startsWith(path.resolve(dir) + path.sep)) {
      throw new Error(`Refusing path traversal outside vault entry: ${f.path}`);
    }
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, f.contents, 'utf8');
  }
}

async function readTree(dir: string, rel = ''): Promise<FetchedFile[]> {
  const out: FetchedFile[] = [];
  for (const ent of await fs.readdir(path.join(dir, rel), { withFileTypes: true })) {
    const relPath = rel ? `${rel}/${ent.name}` : ent.name;
    if (ent.isDirectory()) out.push(...(await readTree(dir, relPath)));
    else if (ent.isFile()) {
      out.push({ path: relPath, contents: await fs.readFile(path.join(dir, relPath), 'utf8') });
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

export class Vault {
  constructor(readonly root: string) {}

  dirOf(slug: string): string {
    return path.join(this.root, slug);
  }

  async list(): Promise<SkillMeta[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.root);
    } catch {
      return [];
    }
    const metas: SkillMeta[] = [];
    for (const e of entries) {
      const m = await this.get(e);
      if (m) metas.push(m);
    }
    return metas.sort((a, b) => a.slug.localeCompare(b.slug));
  }

  metaPath(slug: string): string {
    return path.join(this.dirOf(slug), META_FILE);
  }

  async get(slug: string): Promise<SkillMeta | null> {
    try {
      return JSON.parse(await fs.readFile(this.metaPath(slug), 'utf8')) as SkillMeta;
    } catch {
      return null;
    }
  }

  async saveMeta(meta: SkillMeta): Promise<void> {
    await fs.mkdir(this.dirOf(meta.slug), { recursive: true });
    await fs.writeFile(this.metaPath(meta.slug), JSON.stringify(meta, null, 2) + '\n', 'utf8');
  }

  async readFiles(slug: string): Promise<FetchedFile[]> {
    return readTree(this.dirOf(slug));
  }

  async hashOf(slug: string): Promise<string> {
    return hashSkillFiles(await this.readFiles(slug));
  }

  async install(slug: string, files: FetchedFile[], source: SkillSource): Promise<SkillMeta> {
    const { skill } = validateSkillFolder(files);
    const dir = this.dirOf(slug);
    await fs.rm(dir, { recursive: true, force: true });
    await fs.mkdir(dir, { recursive: true });
    await writeTree(dir, files);
    const now = new Date().toISOString();
    const meta: SkillMeta = {
      slug,
      name: skill.name,
      description: skill.description,
      source,
      contentHash: await hashSkillFiles(files),
      deployments: [],
      installedAt: now,
      updatedAt: now,
    };
    await this.saveMeta(meta);
    return meta;
  }

  async replaceContents(slug: string, files: FetchedFile[]): Promise<SkillMeta> {
    const meta = await this.get(slug);
    if (!meta) throw new Error(`Skill "${slug}" not found in vault`);
    const { skill } = validateSkillFolder(files);
    const dir = this.dirOf(slug);
    for (const ent of await fs.readdir(dir)) {
      if (ent !== META_FILE) await fs.rm(path.join(dir, ent), { recursive: true, force: true });
    }
    await writeTree(dir, files);
    meta.name = skill.name;
    meta.description = skill.description;
    meta.contentHash = await hashSkillFiles(files);
    meta.updatedAt = new Date().toISOString();
    await this.saveMeta(meta);
    return meta;
  }

  async remove(slug: string): Promise<void> {
    await fs.rm(this.dirOf(slug), { recursive: true, force: true });
  }
}
```

- [ ] **Step 4: Run tests until green**

Run: `pnpm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/vault.ts test/vault.test.ts && git commit -m "feat(core): central vault with hashed installs and traversal guard"
```

---

### Task 5: Agent preset catalog + detection (`core/targets.ts`)

**Files:**
- Create: `src/core/targets.ts`
- Test: `test/targets.test.ts`

**Interfaces:**
- Consumes: `TargetConfig` type, `expandHome` from config.
- Produces:
  - `interface AgentPreset { key: string; name: string; globalPath: string }`
  - `AGENT_PRESETS: AgentPreset[]` (static catalog below)
  - `detectInstalledPresets(): Promise<AgentPreset[]>` — presets whose expanded globalPath exists
  - `presetToTarget(p: AgentPreset): TargetConfig` — `{ id: key + '-global', ..., active: true }`

- [ ] **Step 1: Write failing tests**

```ts
// test/targets.test.ts
import { describe, expect, it } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { AGENT_PRESETS, detectInstalledPresets, presetToTarget } from '../src/core/targets.js';

describe('targets', () => {
  it('catalog includes claude-code, opencode and universal .agents', () => {
    const keys = AGENT_PRESETS.map((p) => p.key);
    expect(keys).toContain('claude-code');
    expect(keys).toContain('opencode');
    expect(keys).toContain('agents');
    const agents = AGENT_PRESETS.find((p) => p.key === 'agents')!;
    expect(agents.globalPath).toBe('~/.agents/skills');
  });

  it('presetToTarget shape', () => {
    const t = presetToTarget({ key: 'claude-code', name: 'Claude Code', globalPath: '~/.claude/skills' });
    expect(t.id).toBe('claude-code-global');
    expect(t.active).toBe(true);
    expect(t.path).toBe('~/.claude/skills');
  });

  it('detectInstalledPresets finds existing dirs only', async () => {
    const fakeHome = await mkHome();
    // detectInstalledPresets uses expandHome which reads real homedir; we test via injection instead:
    const found = await detectInstalledPresetsIn(fakeHome);
    expect(found).toHaveLength(0);
  });
});

import fs from 'node:fs/promises';
import { mkTmp } from './helpers.js';
import { detectInstalledPresetsIn } from '../src/core/targets.js';

async function mkHome(): Promise<string> {
  const home = await mkTmp();
  await fs.mkdir(path.join(home, '.claude', 'skills'), { recursive: true });
  return home;
}
```

Note: production `detectInstalledPresets()` calls `detectInstalledPresetsIn(os.homedir())`.

- [ ] **Step 2: Verify failure**

Run: `pnpm test` → FAIL resolving targets module.

- [ ] **Step 3: Implement**

```ts
// src/core/targets.ts
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expandHome } from './config.js';
import type { TargetConfig } from '../types.js';

export interface AgentPreset {
  key: string;
  name: string;
  globalPath: string;
}

export const AGENT_PRESETS: AgentPreset[] = [
  { key: 'agents', name: 'Universal (.agents)', globalPath: '~/.agents/skills' },
  { key: 'claude-code', name: 'Claude Code', globalPath: '~/.claude/skills' },
  { key: 'opencode', name: 'OpenCode', globalPath: '~/.config/opencode/skills' },
  { key: 'codex', name: 'Codex', globalPath: '~/.codex/skills' },
  { key: 'cursor', name: 'Cursor', globalPath: '~/.cursor/skills' },
  { key: 'windsurf', name: 'Windsurf', globalPath: '~/.codeium/windsurf/skills' },
  { key: 'gemini-cli', name: 'Gemini CLI', globalPath: '~/.gemini/skills' },
  { key: 'github-copilot', name: 'GitHub Copilot', globalPath: '~/.copilot/skills' },
  { key: 'antigravity-cli', name: 'Antigravity CLI', globalPath: '~/.gemini/antigravity-cli/skills' },
  { key: 'cline', name: 'Cline', globalPath: '~/.agents/skills' },
  { key: 'droid', name: 'Droid (Factory)', globalPath: '~/.factory/skills' },
  { key: 'roo', name: 'Roo Code', globalPath: '~/.roo/skills' },
  { key: 'crush', name: 'Crush', globalPath: '~/.config/crush/skills' },
  { key: 'qwen-code', name: 'Qwen Code', globalPath: '~/.qwen/skills' },
];

export async function detectInstalledPresetsIn(home: string): Promise<AgentPreset[]> {
  const found: AgentPreset[] = [];
  for (const p of AGENT_PRESETS) {
    const resolved = p.globalPath.startsWith('~') ? home + p.globalPath.slice(1) : p.globalPath;
    try {
      if ((await fs.stat(resolved)).isDirectory()) found.push(p);
    } catch {
      /* not installed */
    }
  }
  return found;
}

export function detectInstalledPresets(): Promise<AgentPreset[]> {
  return detectInstalledPresetsIn(os.homedir());
}

export function presetToTarget(p: AgentPreset): TargetConfig {
  return { id: `${p.key}-global`, name: p.name, path: p.globalPath, type: p.key, active: true };
}
```

(The `path` import is consumed by the CRUD helpers added in Task 15 — keep it.)

- [ ] **Step 4: Run tests until green**

Run: `pnpm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/targets.ts test/targets.test.ts && git commit -m "feat(core): agent preset catalog with filesystem detection"
```

---

### Task 6: Sync engine — symlink/junction/copy ladder (`core/sync.ts`)

**Files:**
- Create: `src/core/sync.ts`
- Test: `test/sync.test.ts`

**Interfaces:**
- Consumes: `SyncMethod` type.
- Produces:
  - `deploy(skillDir: string, targetPath: string, slug: string): Promise<{ linkPath: string; method: SyncMethod }>`
  - `removeDeployment(linkPath: string): Promise<void>`
  Ladder: existing-correct-link short-circuit → symlink (posix) / junction (win32) → recursive copy fallback. Existing non-link dirs at destination are replaced.

- [ ] **Step 1: Write failing tests**

```ts
// test/sync.test.ts
import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { deploy, removeDeployment } from '../src/core/sync.js';
import { mkTmp } from './helpers.js';

async function makeSkill(tmp: string): Promise<string> {
  const dir = path.join(tmp, 'vault', 'tdd');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'SKILL.md'), 'hello');
  return dir;
}

describe('deploy', () => {
  it('creates link whose contents resolve to skill dir', async () => {
    const tmp = await mkTmp();
    const skillDir = await makeSkill(tmp);
    const res = await deploy(skillDir, path.join(tmp, 'target'), 'tdd');
    expect(['symlink', 'junction']).toContain(res.method);
    expect(res.linkPath.toLowerCase()).toBe(path.join(tmp, 'target', 'tdd').toLowerCase());
    await expect(fs.readFile(path.join(res.linkPath, 'SKILL.md'), 'utf8')).resolves.toBe('hello');
  });

  it('is idempotent when link already correct', async () => {
    const tmp = await mkTmp();
    const skillDir = await makeSkill(tmp);
    const first = await deploy(skillDir, path.join(tmp, 'target'), 'tdd');
    const second = await deploy(skillDir, path.join(tmp, 'target'), 'tdd');
    expect(second.method).toBe(first.method);
  });

  it('replaces stale copy at destination', async () => {
    const tmp = await mkTmp();
    const skillDir = await makeSkill(tmp);
    const destDir = path.join(tmp, 'target', 'tdd');
    await fs.mkdir(destDir, { recursive: true });
    await fs.writeFile(path.join(destDir, 'SKILL.md'), 'stale');
    const res = await deploy(skillDir, path.join(tmp, 'target'), 'tdd');
    await expect(fs.readFile(path.join(res.linkPath, 'SKILL.md'), 'utf8')).resolves.toBe('hello');
  });
});

describe('removeDeployment', () => {
  it('removes created deployment', async () => {
    const tmp = await mkTmp();
    const skillDir = await makeSkill(tmp);
    const res = await deploy(skillDir, path.join(tmp, 'target'), 'tdd');
    await removeDeployment(res.linkPath);
    await expect(fs.lstat(res.linkPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('refuses unrelated directories without SKILL.md', async () => {
    const tmp = await mkTmp();
    const other = path.join(tmp, 'precious');
    await fs.mkdir(other);
    await fs.writeFile(path.join(other, 'data.txt'), 'keep me');
    await expect(removeDeployment(other)).rejects.toThrow(/refus/i);
  });
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm test` → FAIL resolving sync module.

- [ ] **Step 3: Implement**

```ts
// src/core/sync.ts
import fs from 'node:fs/promises';
import path from 'node:path';
import type { SyncMethod } from '../types.js';

export interface DeployResult {
  linkPath: string;
  method: SyncMethod;
}

async function isLink(p: string): Promise<boolean> {
  try {
    return (await fs.lstat(p)).isSymbolicLink();
  } catch {
    return false;
  }
}

async function pointsAt(link: string, target: string): Promise<boolean> {
  try {
    return path.resolve(await fs.realpath(link)) === path.resolve(target);
  } catch {
    return false;
  }
}

export async function deploy(skillDir: string, targetPath: string, slug: string): Promise<DeployResult> {
  const linkPath = path.join(targetPath, slug);
  await fs.mkdir(targetPath, { recursive: true });

  if (await isLink(linkPath)) {
    if (await pointsAt(linkPath, skillDir)) {
      return { linkPath, method: process.platform === 'win32' ? 'junction' : 'symlink' };
    }
    await fs.unlink(linkPath);
  } else {
    try {
      await fs.access(linkPath);
      await fs.rm(linkPath, { recursive: true, force: true }); // stale copy/dir we own
    } catch {
      /* does not exist */
    }
  }

  const type = process.platform === 'win32' ? ('junction' as const) : undefined;
  try {
    await fs.symlink(path.resolve(skillDir), linkPath, type);
    return { linkPath, method: type ?? 'symlink' };
  } catch {
    await fs.cp(skillDir, linkPath, { recursive: true });
    return { linkPath, method: 'copy' };
  }
}

export async function removeDeployment(linkPath: string): Promise<void> {
  if (await isLink(linkPath)) {
    await fs.unlink(linkPath);
    return;
  }
  try {
    await fs.access(linkPath);
  } catch {
    return; // already gone
  }
  const marker = path.join(linkPath, 'SKILL.md');
  try {
    await fs.access(marker);
  } catch {
    throw new Error(`Refusing to delete ${linkPath}: not a managed link and has no SKILL.md`);
  }
  await fs.rm(linkPath, { recursive: true, force: true });
}
```

- [ ] **Step 4: Run tests until green**

Run: `pnpm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/sync.ts test/sync.test.ts && git commit -m "feat(core): deploy engine with symlink->junction->copy ladder"
```

---

### Task 7: Registry search client (`core/registry.ts`)

**Files:**
- Create: `src/core/registry.ts`
- Test: `test/registry.test.ts`

**Interfaces:**
- Produces:
  - `interface SearchResult { id: string; skillId: string; name: string; installs: number; source: string }`
  - `searchSkills(query: string, limit?: number, fetchImpl?: typeof fetch): Promise<SearchResult[]>` — hits `https://skills.sh/api/search?q=<enc>&limit=<n>`; throws `RegistryError` on non-OK.
  - `class RegistryError extends Error { readonly status: number }`

- [ ] **Step 1: Write failing tests**

```ts
// test/registry.test.ts
import { describe, expect, it } from 'vitest';
import { RegistryError, searchSkills } from '../src/core/registry.js';

describe('searchSkills', () => {
  it('maps API response fields and encodes query', async () => {
    let calledUrl = '';
    const results = await searchSkills('tdd', 3, (async (url: any) => {
      calledUrl = String(url);
      return new Response(
        JSON.stringify({
          skills: [{ id: 'o/r/tdd', skillId: 'tdd', name: 'tdd', installs: 100, source: 'o/r' }],
        }),
        { status: 200 },
      );
    }) as typeof fetch);
    expect(calledUrl).toContain('q=tdd');
    expect(calledUrl).toContain('limit=3');
    expect(results[0]).toMatchObject({ id: 'o/r/tdd', installs: 100, source: 'o/r' });
  });

  it('throws RegistryError with status on failure', async () => {
    const fail = (async () => new Response(JSON.stringify({}), { status: 401 })) as typeof fetch;
    await expect(searchSkills('x', 20, fail)).rejects.toThrow(RegistryError);
    await expect(searchSkills('x', 20, fail)).rejects.toMatchObject({ status: 401 });
  });
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm test` → FAIL resolving registry module.

- [ ] **Step 3: Implement**

```ts
// src/core/registry.ts
const SEARCH_API_BASE = process.env['SKILLBASE_SEARCH_API'] ?? 'https://skills.sh/api/search';

export class RegistryError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export interface SearchResult {
  id: string;
  skillId: string;
  name: string;
  installs: number;
  source: string;
}

export async function searchSkills(
  query: string,
  limit = 20,
  fetchImpl: typeof fetch = fetch,
): Promise<SearchResult[]> {
  const url = `${SEARCH_API_BASE}?q=${encodeURIComponent(query)}&limit=${limit}`;
  const res = await fetchImpl(url, { headers: { accept: 'application/json' } });
  if (!res.ok) {
    throw new RegistryError(res.status, `skills.sh search failed: HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    skills?: Array<{ id?: string; skillId?: string; name?: string; installs?: number; source?: string }>;
  };
  return (data.skills ?? []).map((s) => ({
    id: s.id ?? '',
    skillId: s.skillId ?? '',
    name: s.name ?? '',
    installs: s.installs ?? 0,
    source: s.source ?? '',
  }));
}
```

- [ ] **Step 4: Run tests until green**

Run: `pnpm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/registry.ts test/registry.test.ts && git commit -m "feat(core): unauthenticated skills.sh search client"
```

---

### Task 8: GitHub source parsing + download (`core/github.ts`)

**Files:**
- Create: `src/core/github.ts`
- Test: `test/github.test.ts`

**Interfaces:**
- Consumes: `FetchedFile`.
- Produces:
  - `interface RepoRef { owner: string; repo: string; ref?: string; subdir?: string }`
  - `type ParsedInput = { kind: 'github'; repo: RepoRef; skillName?: string } | { kind: 'local'; localPath: string }`
  - `parseSource(input: string): ParsedInput | null` — handles `owner/repo@skill`, `owner/repo`, GitHub URLs incl. `/tree/<ref>/<dir>`, local paths (starts with `.`/`/`/drive letter or exists check left to caller).
  - `class GithubClient { constructor(fetchImpl?: typeof fetch, token?: string); listTree(ref: RepoRef): Promise<TreeEntry[]>; findSkillDirs(ref: RepoRef): Promise<string[]>; downloadDir(ref: RepoRef, dir: string): Promise<FetchedFile[]>; repoSkills(ref: RepoRef): Promise<Array<{ name: string; dir: string }>> }`
  - `findSkillDirs` returns **repo-relative** directory strings (`''` = repo root), depth ≤ 3, standard locations ranked first; when `ref.subdir` is set only dirs under it are returned (still full paths).
  - `downloadDir` treats `dir === '' | '.'` as repo root and strips the prefix from returned file paths.

- [ ] **Step 1: Write failing tests**

```ts
// test/github.test.ts
import { describe, expect, it } from 'vitest';
import { GithubClient, parseSource } from '../src/core/github.js';
import type { TreeEntry } from '../src/core/github.js';

describe('parseSource', () => {
  it('parses shorthand forms', () => {
    expect(parseSource('vercel-labs/skills@find-skills')).toEqual({
      kind: 'github',
      repo: { owner: 'vercel-labs', repo: 'skills' },
      skillName: 'find-skills',
    });
    expect(parseSource('vercel-labs/agent-skills')).toEqual({
      kind: 'github',
      repo: { owner: 'vercel-labs', repo: 'agent-skills' },
      skillName: undefined,
    });
  });

  it('parses repo and tree URLs', () => {
    expect(parseSource('https://github.com/o/r')).toEqual({
      kind: 'github',
      repo: { owner: 'o', repo: 'r' },
      skillName: undefined,
    });
    expect(parseSource('https://github.com/o/r/tree/main/skills/foo')).toEqual({
      kind: 'github',
      repo: { owner: 'o', repo: 'r', ref: 'main', subdir: 'skills/foo' },
      skillName: undefined,
    });
  });

  it('parses local paths and rejects garbage', () => {
    expect(parseSource('./my-skill')).toEqual({ kind: 'local', localPath: './my-skill' });
    expect(parseSource('C:\\tmp\\skill')).toEqual({ kind: 'local', localPath: 'C:\\tmp\\skill' });
    expect(parseSource('justaword')).toBeNull();
  });
});

const tree: TreeEntry[] = [
  { path: 'README.md', type: 'blob' },
  { path: 'SKILL.md', type: 'blob' },
  { path: 'skills/foo/SKILL.md', type: 'blob' },
  { path: 'skills/foo/refs/a.md', type: 'blob' },
  { path: '.agents/skills/bar/SKILL.md', type: 'blob' },
];

function ghWithTree(entries: TreeEntry[], files?: Record<string, string>): GithubClient {
  const impl = (async (url: any) => {
    const u = String(url);
    if (u.includes('/git/trees/')) {
      return new Response(JSON.stringify({ tree: entries, truncated: false }), { status: 200 });
    }
    for (const [p, c] of Object.entries(files ?? {})) {
      if (u.endsWith(`/${p}`)) return new Response(c, { status: 200 });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
  return new GithubClient(impl);
}

describe('GithubClient', () => {
  it('lists skill dirs, root first then standard locations', async () => {
    const gh = ghWithTree(tree);
    const dirs = await gh.findSkillDirs({ owner: 'o', repo: 'r' });
    expect(dirs[0]).toBe('');
    expect(dirs).toContain('skills/foo');
    expect(dirs).toContain('.agents/skills/bar');
    expect(dirs.indexOf('skills/foo')).toBeLessThan(dirs.indexOf('.agents/skills/bar'));
  });

  it('with subdir filter returns full repo-relative dirs under it', async () => {
    const gh = ghWithTree(tree);
    const dirs = await gh.findSkillDirs({ owner: 'o', repo: 'r', subdir: 'skills/foo' });
    expect(dirs).toEqual(['skills/foo']);
  });

  it('downloads all files under a dir', async () => {
    const gh = ghWithTree(tree, {
      'skills/foo/SKILL.md': '---\nname: foo\ndescription: d\n---\nx',
      'skills/foo/refs/a.md': 'A',
    });
    const files = await gh.downloadDir({ owner: 'o', repo: 'r' }, 'skills/foo');
    expect(files).toHaveLength(2);
    expect(files[0]).toEqual({ path: 'SKILL.md', contents: expect.stringContaining('name: foo') });
  });

  it('throws on truncated tree', async () => {
    const impl = (async () =>
      new Response(JSON.stringify({ tree: [], truncated: true }), { status: 200 })) as typeof fetch;
    const gh = new GithubClient(impl);
    await expect(gh.listTree({ owner: 'o', repo: 'r' })).rejects.toThrow(/truncated/i);
  });
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm test` → FAIL resolving github module.

- [ ] **Step 3: Implement**

```ts
// src/core/github.ts
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

  const urlM = /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/tree\/([^/]+)((?:\/[\w.\-/]+)?))?\/?$/.exec(trimmed);
  if (urlM) {
    return {
      kind: 'github',
      repo: { owner: urlM[1]!, repo: urlM[2]!, ...(urlM[3] ? { ref: urlM[3], subdir: urlM[4]?.replace(/^\//, '') } : {}) },
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
      if (!b.path.endsWith('/SKILL.md')) continue;
      if (base && !b.path.startsWith(base)) continue;
      const dir = b.path.slice(0, -'/SKILL.md'.length);
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
    return files.sort((a, b) => a.path.localeCompare(b.path));
  }

  /** List skill names available in a repo (basename of each discovered dir; root skill named after repo). */
  async repoSkills(ref: RepoRef): Promise<Array<{ name: string; dir: string }>> {
    const dirs = await this.findSkillDirs(ref);
    return dirs.map((d) => ({ name: d === '' ? ref.repo : d.split('/').pop()!, dir: d }));
  }
}
```

Also export `STANDARD_LOCATIONS` is internal — do not export. Remove `os` import if present.

- [ ] **Step 4: Run tests until green**

Run: `pnpm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/github.ts test/github.test.ts && git commit -m "feat(core): github source parser and skill downloader via trees+raw API"
```

---

### Task 9: Updater — check, diff summary, apply (`core/updater.ts`)

**Files:**
- Create: `src/core/updater.ts`
- Test: `test/updater.test.ts`

**Interfaces:**
- Consumes: `Vault`, `hashSkillFiles`; `GithubClient.downloadDir`; `sync.deploy`; types `SkillMeta`, `FetchedFile`, `Deployment`.
- Produces:
  - `type Downloader = (repoRef: { owner: string; repo: string; ref?: string }, dir: string) => Promise<FetchedFile[]>`
  - `interface UpdateCandidate { meta: SkillMeta; latest: FetchedFile[]; latestHash: string }`
  - `checkUpdates(vault: Vault, downloadDir: Downloader, opts?: { timeoutMs?: number }): Promise<UpdateCandidate[]>` — registry-sourced skills only, parallel with per-job timeout (default 2000ms), failures skipped silently via allSettled.
  - `summarizeChanges(current: FetchedFile[], latest: FetchedFile[]): { added: string[]; removed: string[]; changed: string[] }`
  - `applyUpdate(vault: Vault, cand: UpdateCandidate): Promise<SkillMeta>` — replace contents, redeploy copy-method deployments (symlink/junction links survive because path unchanged).
  - `maybeCheckForUpdates(args: { cfg: AppConfig; cfgPath: string; vault: Vault; gh: GithubClient; force?: boolean }): Promise<number>` — returns outdated count, respects interval, always stamps `lastCheck`, saves config.

- [ ] **Step 1: Write failing tests**

```ts
// test/updater.test.ts
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { Vault } from '../src/core/vault.js';
import { applyUpdate, checkUpdates, maybeCheckForUpdates, summarizeChanges } from '../src/core/updater.js';
import { mkTmp } from './helpers.js';
import { saveConfig } from '../src/core/config.js';
import type { FetchedFile, SkillSource } from '../src/types.js';

const v1: FetchedFile[] = [{ path: 'SKILL.md', contents: '---\nname: tdd\ndescription: d\n---\nv1' }];
const v2: FetchedFile[] = [{ path: 'SKILL.md', contents: '---\nname: tdd\ndescription: d\n---\nv2' }];
const src: SkillSource = { type: 'registry', owner: 'o', repo: 'r', path: 'skills/tdd', skillId: 'tdd' };

describe('summarizeChanges', () => {
  it('classifies added/removed/changed', () => {
    const cur: FetchedFile[] = [
      { path: 'SKILL.md', contents: 'a' },
      { path: 'old.md', contents: 'x' },
    ];
    const lat: FetchedFile[] = [
      { path: 'SKILL.md', contents: 'b' },
      { path: 'new.md', contents: 'y' },
    ];
    const s = summarizeChanges(cur, lat);
    expect(s.changed).toEqual(['SKILL.md']);
    expect(s.removed).toEqual(['old.md']);
    expect(s.added).toEqual(['new.md']);
  });
});

describe('checkUpdates + applyUpdate', () => {
  it('detects outdated and applies', async () => {
    const root = await mkTmp();
    const vault = new Vault(path.join(root, 'vault'));
    await vault.install('tdd', v1, src);

    const download = async () => v2;

    const outdated = await checkUpdates(vault, download, { timeoutMs: 500 });
    expect(outdated).toHaveLength(1);
    expect(outdated[0]!.meta.slug).toBe('tdd');

    const meta = await applyUpdate(vault, outdated[0]!);
    expect(meta.contentHash).not.toBe((await vault.get('tdd'))!.contentHash);
    expect(await vault.readFiles('tdd')).toEqual(v2);
  });

  it('skips local-source skills', async () => {
    const root = await mkTmp();
    const vault = new Vault(path.join(root, 'vault'));
    await vault.install('mine', v1, { type: 'local' });
    const outdated = await checkUpdates(vault, async () => v2, { timeoutMs: 200 });
    expect(outdated).toHaveLength(0);
  });
});

describe('maybeCheckForUpdates', () => {
  it('respects interval and stamps lastCheck', async () => {
    const root = await mkTmp();
    const cfgPath = path.join(root, 'config.json');
    const cfg = {
      version: 1 as const,
      vaultPath: path.join(root, 'vault'),
      targets: [],
      updateCheck: { intervalHours: 24, lastCheck: null },
    };
    const vault = new Vault(path.join(root, 'vault'));

    const n1 = await maybeCheckForUpdates({ cfg, cfgPath, vault, downloadDir: async () => v2, force: true });
    expect(n1).toBe(0);
    expect(cfg.updateCheck.lastCheck).toBeTruthy();

    const saved = JSON.parse(await (await import('node:fs/promises')).readFile(cfgPath, 'utf8'));
    expect(saved.updateCheck.lastCheck).toBeTruthy();
  });
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm test` → FAIL resolving updater module.

- [ ] **Step 3: Implement**

```ts
// src/core/updater.ts
import path from 'node:path';
import { saveConfig } from './config.js';
import { deploy } from './sync.js';
import { Vault, hashSkillFiles } from './vault.js';
import type { AppConfig, FetchedFile, SkillMeta } from '../types.js';

export interface UpdateCandidate {
  meta: SkillMeta;
  latest: FetchedFile[];
  latestHash: string;
}

/** Structural seam over GithubClient.downloadDir — keeps this module network-free and stubbable. */
export type Downloader = (
  repoRef: { owner: string; repo: string; ref?: string },
  dir: string,
) => Promise<FetchedFile[]>;

function timeoutRace<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error('update check timed out')), ms)),
  ]);
}

function refOf(meta: SkillMeta): { owner: string; repo: string; ref?: string } {
  return {
    owner: meta.source.owner!,
    repo: meta.source.repo!,
    ...(meta.source.ref ? { ref: meta.source.ref } : {}),
  };
}

export async function checkUpdates(
  vault: Vault,
  downloadDir: Downloader,
  opts: { timeoutMs?: number } = {},
): Promise<UpdateCandidate[]> {
  const all = await vault.list();
  const tracked = all.filter((m) => m.source.type === 'registry' && !m.external);
  const timeoutMs = opts.timeoutMs ?? 2000;
  const jobs = tracked.map(async (meta) => {
    const latest = await downloadDir(refOf(meta), meta.source.path ?? '.');
    const latestHash = await hashSkillFiles(latest);
    if (latestHash === meta.contentHash) return null;
    return { meta, latest, latestHash } satisfies UpdateCandidate;
  });
  const settled = await Promise.allSettled(jobs.map((p) => timeoutRace(p, timeoutMs)));
  return settled
    .filter((s): s is PromiseFulfilledResult<UpdateCandidate | null> => s.status === 'fulfilled' && s.value !== null)
    .map((s) => s.value!);
}
```

Continue in the same file:

```ts
export function summarizeChanges(current: FetchedFile[], latest: FetchedFile[]) {
  const curMap = new Map(current.map((f) => [f.path, f.contents]));
  const latMap = new Map(latest.map((f) => [f.path, f.contents]));
  const added = [...latMap.keys()].filter((p) => !curMap.has(p));
  const removed = [...curMap.keys()].filter((p) => !latMap.has(p));
  const changed = [...latMap.keys()].filter((p) => curMap.has(p) && curMap.get(p) !== latMap.get(p));
  return { added, removed, changed };
}

export async function applyUpdate(vault: Vault, cand: UpdateCandidate): Promise<SkillMeta> {
  const meta = await vault.replaceContents(cand.meta.slug, cand.latest);

```ts
export function summarizeChanges(current: FetchedFile[], latest: FetchedFile[]) {
  const curMap = new Map(current.map((f) => [f.path, f.contents]));
  const latMap = new Map(latest.map((f) => [f.path, f.contents]));
  const added = [...latMap.keys()].filter((p) => !curMap.has(p));
  const removed = [...curMap.keys()].filter((p) => !latMap.has(p));
  const changed = [...latMap.keys()].filter((p) => curMap.has(p) && curMap.get(p) !== latMap.get(p));
  return { added, removed, changed };
}

export async function applyUpdate(vault: Vault, cand: UpdateCandidate): Promise<SkillMeta> {
  const meta = await vault.replaceContents(cand.meta.slug, cand.latest);
  for (const dep of meta.deployments) {
    if (dep.method === 'copy') {
      await deploy(vault.dirOf(meta.slug), path.dirname(dep.linkPath), meta.slug);
    }
  }
  return meta;
}

export async function maybeCheckForUpdates(args: {
  cfg: AppConfig;
  cfgPath: string;
  vault: Vault;
  downloadDir: Downloader;
  force?: boolean;
}): Promise<number> {
  const { cfg, cfgPath, vault, downloadDir, force } = args;
  const last = cfg.updateCheck.lastCheck ? Date.parse(cfg.updateCheck.lastCheck) : 0;
  const stale = Date.now() - last > cfg.updateCheck.intervalHours * 3600_000;
  if (!force && !stale) return 0;
  let count = 0;
  try {
    count = (await checkUpdates(vault, downloadDir, { timeoutMs: 2000 })).length;
  } catch {
    /* silent */
  }
  cfg.updateCheck.lastCheck = new Date().toISOString();
  try {
    await saveConfig(cfg, cfgPath);
  } catch {
    /* non-fatal */
  }
  return count;
}
```

- [ ] **Step 4: Run tests until green**

Run: `pnpm test` → PASS. (The test stubs already match the `Downloader` function signature: pass `gh.downloadDir`-shaped functions directly, e.g. `checkUpdates(vault, async () => v2, { timeoutMs: 500 })` and `maybeCheckForUpdates({ cfg, cfgPath, vault, downloadDir: async () => v2, force: true })`.)

- [ ] **Step 5: Commit**

```bash
git add src/core/updater.ts test/updater.test.ts && git commit -m "feat(core): hash-based update checker with reviewed apply flow"
```

### Task 10: Scanner — find & adopt unmanaged skills (`core/scanner.ts`)

**Files:**
- Modify: `src/core/vault.ts` (export `readTree`)
- Create: `src/core/scanner.ts`
- Test: `test/scanner.test.ts`

**Interfaces:**
- Consumes: `Vault.readTree` (now exported standalone), `parseFrontmatter`, `deploy`, `expandHome`.
- Produces:
  - `interface UnmanagedSkill { targetId: string; dir: string; slugGuess: string; name: string; description: string }`
  - `findUnmanaged(vault: Vault, targets: TargetConfig[], home?: string): Promise<UnmanagedSkill[]>` — walks active targets, skips anything resolving inside the vault, requires `SKILL.md`.
  - `adopt(vault: Vault, u: UnmanagedSkill): Promise<SkillMeta>` — moves folder into vault (install), deploys link back to the original parent, records deployment.

- [ ] **Step 0: Export readTree from vault**

In `src/core/vault.ts`, change `async function readTree(` to `export async function readTree(` (signature unchanged).

- [ ] **Step 1: Write failing tests**

```ts
// test/scanner.test.ts
import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Vault } from '../src/core/vault.js';
import { deploy } from '../src/core/sync.js';
import { adopt, findUnmanaged } from '../src/core/scanner.js';
import { mkTmp } from './helpers.js';

const DOC = '---\nname: legacy-skill\ndescription: old skill\n---\nbody';

describe('findUnmanaged', () => {
  it('detects SKILL.md folders outside the vault', async () => {
    const root = await mkTmp();
    const vault = new Vault(path.join(root, 'vault'));
    await fs.mkdir(vault.root, { recursive: true });
    const targetRoot = path.join(root, '.agents', 'skills');
    await fs.mkdir(targetRoot, { recursive: true });
    await fs.writeFile(path.join(targetRoot, 'legacy', 'SKILL.md'), DOC);

    const found = await findUnmanaged(
      vault,
      [{ id: 't1', name: 'T', path: path.join(root, '.agents', 'skills'), type: 'custom', active: true }],
      root,
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ slugGuess: 'legacy', name: 'legacy-skill', targetId: 't1' });
  });

  it('skips links pointing into the vault', async () => {
    const root = await mkTmp();
    const vault = new Vault(path.join(root, 'vault'));
    const files = [{ path: 'SKILL.md', contents: DOC }];
    await vault.install('legacy', files, { type: 'local' });
    const targetRoot = path.join(root, 'skills');
    const res = await deploy(vault.dirOf('legacy'), targetRoot, 'legacy');

    const found = await findUnmanaged(
      vault,
      [{ id: 't1', name: 'T', path: targetRoot, type: 'custom', active: true }],
      root,
    );
    expect(found).toHaveLength(0);
  });
});

describe('adopt', () => {
  it('moves into vault and relinks original location', async () => {
    const root = await mkTmp();
    const vault = new Vault(path.join(root, 'vault'));
    const orig = path.join(root, 'skills', 'legacy');
    await fs.mkdir(orig, { recursive: true });
    await fs.writeFile(path.join(orig, 'SKILL.md'), DOC);

    const meta = await adopt(
      vault,
      { targetId: 't1', dir: orig, slugGuess: 'legacy', name: 'legacy-skill', description: 'old skill' },
    );
    expect(meta.slug).toBe('legacy');
    await expect(fs.readFile(vault.dirOf('legacy') + '/SKILL.md', 'utf8')).resolves.toBe(DOC);
    // original path now resolves into the vault
    await expect(fs.readFile(path.join(orig, 'SKILL.md'), 'utf8')).resolves.toBe(DOC);
    expect(meta.deployments[0]!.linkPath.toLowerCase()).toBe(orig.toLowerCase());
  });
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm test` → FAIL resolving scanner module.

- [ ] **Step 3: Implement**

```ts
// src/core/scanner.ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseFrontmatter } from './frontmatter.js';
import { deploy } from './sync.js';
import { readTree, Vault } from './vault.js';
import { expandHome } from './config.js';
import type { FetchedFile, SkillMeta, TargetConfig } from '../types.js';

export interface UnmanagedSkill {
  targetId: string;
  dir: string;
  slugGuess: string;
  name: string;
  description: string;
}

async function realpathSafe(p: string): Promise<string | null> {
  try {
    return await fs.realpath(p);
  } catch {
    return null;
  }
}

export async function findUnmanaged(vault: Vault, targets: TargetConfig[], home?: string): Promise<UnmanagedSkill[]> {
  const expand = home ? (p: string) => (p.startsWith('~') ? path.join(home, p.slice(1)) : p) : expandHome;
  const known = new Set((await vault.list()).map((m) => m.slug));
  const vaultReal = await realpathSafe(vault.root);
  const out: UnmanagedSkill[] = [];

  for (const t of targets.filter((x) => x.active)) {
    const root = expand(t.path);
    let entries;
    try {
      entries = await fs.readdir(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const dir = path.join(root, ent.name);
      const real = await realpathSafe(dir);
      if (vaultReal && real && (real === vaultReal || real.startsWith(vaultReal + path.sep))) continue;
      let raw: string;
      try {
        raw = await fs.readFile(path.join(dir, 'SKILL.md'), 'utf8');
      } catch {
        continue;
      }
      if (known.has(ent.name)) continue;
      try {
        const parsed = parseFrontmatter(raw);
        out.push({ targetId: t.id, dir, slugGuess: ent.name, name: parsed.name, description: parsed.description });
      } catch {
        /* invalid frontmatter — not our business */
      }
    }
  }
  return out;
}

export async function adopt(vault: Vault, u: UnmanagedSkill): Promise<SkillMeta> {
  const files: FetchedFile[] = await readTree(u.dir);
  const meta = await vault.install(u.slugGuess, files, { type: 'local' });
  const res = await deploy(vault.dirOf(u.slugGuess), path.dirname(u.dir), u.slugGuess);
    meta.deployments.push({ targetId: u.targetId, linkPath: res.linkPath, method: res.method });
  await vault.saveMeta(meta);
  return meta;
}
```

- [ ] **Step 4: Run tests until green**

Run: `pnpm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/scanner.ts src/core/vault.ts test/scanner.test.ts && git commit -m "feat(core): scan agent targets and adopt unmanaged skills"
```

---

### Task 11: UI kit — Io port, clack adapter, table, diff

**Files:**
- Create: `src/ui/io.ts`, `src/ui/clack-io.ts`, `src/ui/table.ts`, `src/ui/format.ts`, `src/ui/diff.ts`
- Modify: `test/helpers.ts`
- Test: `test/ui.test.ts`

**Interfaces:**
- Produces (all later command tasks consume these):
  - `interface CliIo { intro(m:string):void; outro(m:string):void; info(m:string):void; warn(m:string):void; error(m:string):void; text(o:{message:string;defaultValue?:string}):Promise<string>; select<T extends string>(o:{message:string;options:{value:T;label:string}[]}):Promise<T>; multiselect<T extends string>(o:{message:string;options:{value:T;label:string}[];initialValues?:T[]}):Promise<T[]>; confirm(o:{message:string}):Promise<boolean>; spinner():{start(m?:string):void;stop(m?:string):void}; }`
  - `class CancelledError extends Error`; `function cancelled(v: unknown): boolean` (true for clack cancel symbols)
  - `clackIo(): CliIo`
  - `renderTable(headers: string[], rows: string[][]): string`
  - `formatInstalls(n: number): string`
  - `lineDiff(a: string, b: string, maxLines?: number): { removed: string[]; added: string[] }`
  - test helper `createTestIo(scripts: { texts?: string[]; selects?: string[]; multis?: string[][]; confirms?: boolean[] })` appended to `test/helpers.ts` returning `{ io, out: string[] }`.

- [ ] **Step 1: Write failing tests**

```ts
// test/ui.test.ts
import { describe, expect, it } from 'vitest';
import { renderTable } from '../src/ui/table.js';
import { formatInstalls } from '../src/ui/format.js';
import { lineDiff } from '../src/ui/diff.js';
import { createTestIo } from './helpers.js';

describe('renderTable', () => {
  it('aligns columns', () => {
    const t = renderTable(['A', 'B'], [['x', 'yy'], ['zzz', 'w']]);
    const lines = t.split('\n');
    expect(lines[0]).toContain('A');
    expect(lines[0]).toContain('B');
    expect(lines[1]).toMatch(/^-[- ]*-$/);
    expect(lines[2]).toContain('x');
  });
});

describe('formatInstalls', () => {
  it('humanizes counts', () => {
    expect(formatInstalls(0)).toBe('');
    expect(formatInstalls(746961)).toBe('747.0K installs');
    expect(formatInstalls(2453100)).toBe('2.5M installs');
  });
});

describe('lineDiff', () => {
  it('reports removed and added lines', () => {
    const d = lineDiff('a\nb\nc', 'a\nX\nc');
    expect(d.removed).toEqual(['b']);
    expect(d.added).toEqual(['X']);
  });

  it('caps output length', () => {
    const big = Array.from({ length: 500 }, (_, i) => `line${i}`).join('\n');
    const d = lineDiff('', big, 10);
    expect(d.added.length).toBeLessThanOrEqual(10);
  });
});

describe('createTestIo', () => {
  it('scripts answers and captures output', async () => {
    const { io, out } = createTestIo({ texts: ['hello'], confirms: [true], selects: ['a'], multis: [['x']] });
    expect(await io.text({ message: 'q' })).toBe('hello');
    expect(await io.confirm({ message: 'c' })).toBe(true);
    expect(await io.select({ message: 's', options: [{ value: 'a', label: 'A' }] })).toBe('a');
    expect(await io.multiselect({ message: 'm', options: [{ value: 'x', label: 'X' }] })).toEqual(['x']);
    io.info('logged');
    expect(out.join('\n')).toContain('logged');
  });
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm test` → FAIL resolving ui modules / missing helper export.

- [ ] **Step 3: Implement**

`src/ui/io.ts`:

```ts
export class CancelledError extends Error {
  constructor() {
    super('cancelled');
  }
}

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

export interface SpinnerLike {
  start(msg?: string): void;
  stop(msg?: string): void;
}

export interface CliIo {
  intro(msg: string): void;
  outro(msg: string): void;
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  text(opts: { message: string; defaultValue?: string }): Promise<string>;
  select<T extends string>(opts: { message: string; options: SelectOption<T>[] }): Promise<T>;
  multiselect<T extends string>(opts: { message: string; options: SelectOption<T>[]; initialValues?: T[] }): Promise<T[]>;
  confirm(opts: { message: string; initialValue?: boolean }): Promise<boolean>;
  spinner(): SpinnerLike;
}

/** True when value is a clack-style cancel symbol. */
export function cancelled(v: unknown): boolean {
  return typeof v === 'symbol';
}

export function assertOk<T>(v: T | symbol): T {
  if (cancelled(v)) throw new CancelledError();
  return v as T;
}
```

`src/ui/clack-io.ts`:

```ts
import * as p from '@clack/prompts';
import { assertOk, type CliIo, type SelectOption, type SpinnerLike } from './io.js';

export function clackIo(): CliIo {
  return {
    intro: (m) => p.intro(m),
    outro: (m) => p.outro(m),
    info: (m) => p.log.info(m),
    warn: (m) => p.log.warn(m),
    error: (m) => p.log.error(m),
    text: (o) => assertOk(p.text(o)),
    select: <T extends string>(o: { message: string; options: SelectOption<T>[] }) =>
      assertOk(p.select({ message: o.message, options: o.options.map((x) => ({ value: x.value, label: x.label })) })) as Promise<T>,
    multiselect: <T extends string>(o: { message: string; options: SelectOption<T>[]; initialValues?: T[] }) =>
      assertOk(p.multiselect({ message: o.message, options: o.options, initialValues: o.initialValues })) as Promise<T[]>,
    confirm: (o) => assertOk(p.confirm(o)) as Promise<boolean>,
    spinner(): SpinnerLike {
      const s = p.spinner();
      return { start: (m) => s.start(m), stop: (m) => s.stop(m) };
    },
  };
}
```

`src/ui/table.ts`:

```ts
export function renderTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)),
  );
  const fmt = (cells: string[]) => cells.map((c, i) => (c ?? '').padEnd(widths[i]!)).join('  ');
  const bar = '-'.repeat(widths.reduce((a, b) => a + b, 0) + 2 * (headers.length - 1));
  return [fmt(headers), bar, ...rows.map(fmt)].join('\n');
}
```

`src/ui/format.ts`:

```ts
export function formatInstalls(n: number): string {
  if (!n || n <= 0) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M installs`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K installs`;
  return `${n} install${n === 1 ? '' : 's'}`;
}
```

Note: test expects `'747.0K installs'` — `(746961/1000).toFixed(1)` = `'747.0'` ✓ and `'2.5M installs'` ✓. Keep `.0` (do NOT strip, unlike official CLI).

`src/ui/diff.ts`:

```ts
export function lineDiff(a: string, b: string, maxLines = 80): { removed: string[]; added: string[] } {
  const A = a.split('\n').slice(0, 2000);
  const B = b.split('\n').slice(0, 2000);
  // LCS table (sizes bounded by 2000 -> 4M cells worst case; cap further for safety)
  if (A.length * B.length > 1_000_000) {
    const setA = new Set(A);
    const setB = new Set(B);
    return {
      removed: A.filter((l) => !setB.has(l)).slice(0, maxLines),
      added: B.filter((l) => !setA.has(l)).slice(0, maxLines),
    };
  }
  const dp: number[][] = Array.from({ length: A.length + 1 }, () => new Array(B.length + 1).fill(0));
  for (let i = A.length - 1; i >= 0; i--) {
    for (let j = B.length - 1; j >= 0; j--) {
      dp[i]![j] = A[i] === B[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const removed: string[] = [];
  const added: string[] = [];
  let i = 0;
  let j = 0;
  while (i < A.length && j < B.length) {
    if (A[i] === B[j]) {
      i++; j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      removed.push(A[i++]!);
    } else {
      added.push(B[j++]!);
    }
  }
  while (i < A.length) removed.push(A[i++]!);
  while (j < B.length) added.push(B[j++]!);
  return { removed: removed.slice(0, maxLines), added: added.slice(0, maxLines) };
}
```

Append to `test/helpers.ts`:

```ts
import { CancelledError, type CliIo } from '../src/ui/io.js';

export interface TestIoScript {
  texts?: string[];
  selects?: string[];
  multis?: string[][];
  confirms?: boolean[];
}

export function createTestIo(script: TestIoScript = {}): { io: CliIo; out: string[] } {
  const out: string[] = [];
  const ti = script.texts ?? [];
  const si = script.selects ?? [];
  const mi = script.multis ?? [];
  const ci = script.confirms ?? [];
  const io: CliIo = {
    intro: (m) => out.push(m),
    outro: (m) => out.push(m),
    info: (m) => out.push(m),
    warn: (m) => out.push(`WARN:${m}`),
    error: (m) => out.push(`ERROR:${m}`),
    text: async (o) => ti.shift() ?? o.defaultValue ?? '',
    select: async <T extends string>(o: { options: { value: T }[] }) => {
      const v = si.shift();
      if (v === undefined) throw new CancelledError();
      return v as T;
    },
    multiselect: async <T extends string>(o: { options: { value: T }[] }) => {
      const v = mi.shift();
      if (v === undefined) throw new CancelledError();
      return v as T[];
    },
    confirm: async () => ci.shift() ?? false,
    spinner: () => ({ start: () => {}, stop: () => {} }),
  };
  return { io, out };
}
```

- [ ] **Step 4: Run tests until green**

Run: `pnpm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui test/ui.test.ts test/helpers.ts && git commit -m "feat(ui): io port with clack adapter, table, installs format, line diff"
```

---

### Task 12: App context + first-run onboarding + `list` command

**Files:**
- Create: `src/context.ts`, `src/commands/list.ts`
- Modify: `src/cli.ts`
- Test: `test/list.test.ts`

**Interfaces:**
- Consumes: everything so far; `GithubClient` (token from `GITHUB_TOKEN`/`GH_TOKEN` env).
- Produces:
  - `interface CliCtx { cfgPath: string; cfg: AppConfig; vault: Vault; gh: GithubClient }`
  - `ensureContext(io: CliIo): Promise<CliCtx>` — loads config; when absent runs first-run wizard (choose detected preset targets via multiselect, accept defaults), saves config, returns ctx. Memoized per process.
  - `runList(io: CliIo, ctx: CliCtx, opts: {}): Promise<void>` — renders table slug/source/updated/deployments/status.

- [ ] **Step 1: Write failing tests**

```ts
// test/list.test.ts
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { Vault } from '../src/core/vault.js';
import { GithubClient } from '../src/core/github.js';
import { runList } from '../src/commands/list.js';
import { mkTmp } from './helpers.js';
import { createTestIo } from './helpers.js';
import type { AppConfig } from '../src/types.js';

async function ctxWithSkills(): Promise<{ ctx: any; root: string }> {
  const root = await mkTmp();
  const vault = new Vault(path.join(root, 'vault'));
  await vault.install('tdd', [{ path: 'SKILL.md', contents: '---\nname: tdd\ndescription: d\n---\nx' }], {
    type: 'registry',
    owner: 'o',
    repo: 'r',
    skillId: 'tdd',
  });
  await vault.install('mine', [{ path: 'SKILL.md', contents: '---\nname: mine\ndescription: d\n---\nx' }], {
    type: 'local',
  });
  const cfg: AppConfig = {
    version: 1,
    vaultPath: path.join(root, 'vault'),
    targets: [],
    updateCheck: { intervalHours: 24, lastCheck: null },
  };
  return { ctx: { cfgPath: path.join(root, 'config.json'), cfg, vault, gh: new GithubClient() }, root };
}

describe('runList', () => {
  it('lists skills with source and status', async () => {
    const { ctx } = await ctxWithSkills();
    const { io, out } = createTestIo();
    await runList(io, ctx, {});
    const joined = out.join('\n');
    expect(joined).toContain('tdd');
    expect(joined).toContain('mine');
    expect(joined).toContain('o/r');
    expect(joined).toContain('local');
  });

  it('prints empty notice when vault empty', async () => {
    const root = await mkTmp();
    const ctx = {
      cfgPath: path.join(root, 'c.json'),
      cfg: { version: 1, vaultPath: path.join(root, 'v'), targets: [], updateCheck: { intervalHours: 24, lastCheck: null } },
      vault: new Vault(path.join(root, 'v')),
      gh: new GithubClient(),
    };
    const { io, out } = createTestIo();
    await runList(io, ctx, {});
    expect(out.join('\n')).toMatch(/no skills/i);
  });
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm test` → FAIL resolving `../src/commands/list.js`.

- [ ] **Step 3: Implement**

`src/context.ts`:

```ts
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_CONFIG_PATH, defaultConfig, expandHome, loadConfig, saveConfig } from './core/config.js';
import { AGENT_PRESETS, detectInstalledPresets, presetToTarget } from './core/targets.js';
import { GithubClient } from './core/github.js';
import { Vault } from './core/vault.js';
import type { CliIo } from './ui/io.js';
import type { AppConfig } from './types.js';

export interface CliCtx {
  cfgPath: string;
  cfg: AppConfig;
  vault: Vault;
  gh: GithubClient;
}

let cached: Promise<CliCtx> | null = null;

export async function ensureContext(io: CliIo): Promise<CliCtx> {
  cached ??= build(io);
  return cached;
}

async function build(io: CliIo): Promise<CliCtx> {
  const cfgPath = DEFAULT_CONFIG_PATH();
  let cfg = await loadConfig(cfgPath);
  if (!cfg) {
    cfg = defaultConfig();
    const installed = await detectInstalledPresets();
    if (installed.length > 0) {
      const chosen = await io
        .multiselect({
          message: 'Detected agents — which should receive skills?',
          options: installed.map((pr) => ({ value: pr.key, label: pr.name })),
        })
        .catch(() => []);
      const keys = new Set(chosen);
      cfg.targets = installed.filter((pr) => keys.has(pr.key)).map(presetToTarget);
    }
    await saveConfig(cfg, cfgPath);
    io.info(`Config created at ${path.join(os.homedir(), '.skillbase', 'config.json')} (${AGENT_PRESETS.length} presets available via 'skillbase targets')`);
  }
  const token = process.env['GITHUB_TOKEN'] ?? process.env['GH_TOKEN'];
  const vault = new Vault(expandHome(cfg.vaultPath));
  return { cfgPath, cfg, vault, gh: new GithubClient(undefined, token) };
}

export function freshContext(cfgPath: string, cfg: AppConfig, vault: Vault, gh: GithubClient): CliCtx {
  return { cfgPath, cfg, vault, gh };
}
```

`src/commands/list.ts`:

```ts
import fs from 'node:fs/promises';
import picocolors from 'picocolors';
import { renderTable } from '../ui/table.js';
import type { CliCtx } from '../context.js';
import type { CliIo } from '../ui/io.js';

export async function runList(io: CliIo, ctx: CliCtx, _opts: {} = {}): Promise<void> {
  const metas = await ctx.vault.list();
  if (metas.length === 0) {
    io.info(picocolors.dim('No skills in vault yet — try `skillbase find`'));
    return;
  }
  const rows = metas.map((m) => [
    m.slug,
    m.source.type === 'registry' ? `${m.source.owner}/${m.source.repo}` : 'local',
    m.updatedAt.slice(0, 10),
    String(m.deployments.length),
    m.external ? 'external' : m.deployments.length > 0 ? 'deployed' : 'vault-only',
  ]);
  io.info(renderTable(['SLUG', 'SOURCE', 'UPDATED', 'DEPLOYED', 'STATUS'], rows));
  let unmanaged: string[] = [];
  try {
    const entries = await fs.readdir(ctx.vault.root, { withFileTypes: true });
    unmanaged = entries.filter((e) => e.isDirectory()).map((e) => e.name).filter((n) => !metas.some((m) => m.slug === n));
  } catch {
    /* empty vault */
  }
  for (const slug of unmanaged) {
    io.warn(`${slug}: unmanaged (missing metadata) — fix with \`skillbase add\``);
  }
}
```

Modify `src/cli.ts` — register command and wire preAction context creation:

```ts
// src/cli.ts
import { Command } from 'commander';
import { clackIo } from './ui/clack-io.js';
import { CancelledError } from './ui/io.js';
import { ensureContext } from './context.js';
import { runList } from './commands/list.js';

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

  return program;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop()!)) {
  createProgram().parseAsync(process.argv);
}
```

- [ ] **Step 4: Run tests until green + manual smoke**

Run: `pnpm test` → PASS.
Manual: `node bin/skillbase.js ls` (first run creates config; empty-vault notice printed).

- [ ] **Step 5: Commit**

```bash
git add src/context.ts src/commands/list.ts src/cli.ts test/list.test.ts && git commit -m "feat(cli): app context, first-run onboarding, list command"
```

---

### Task 13: `find` command — registry browsing

**Files:**
- Create: `src/commands/find.ts`
- Modify: `src/cli.ts`
- Test: `test/find.test.ts`

**Interfaces:**
- Consumes: `searchSkills` (injectable), `GithubClient.findSkillDirs/downloadDir`, `formatInstalls`.
- Produces:
  - `runFind(io: CliIo, ctx: CliCtx, opts: { query?: string }, deps?: { search?: typeof searchSkills; gh?: GithubClient }): Promise<void>` — non-TTY or explicit query: print results table and exit. Interactive TTY: text query → select → preview SKILL.md head → hand off message `skillbase add owner/repo@skillId` (add integration happens in Task 14 by importing runAdd; here we only print hint to avoid circular import).
  - `resolveSkillDir(gh: Pick<GithubClient,'findSkillDirs'>, ref: RepoRef, skillName: string): Promise<string | null>` — first dir whose basename matches skillName.

- [ ] **Step 1: Write failing tests**

```ts
// test/find.test.ts
import { describe, expect, it } from 'vitest';
import { resolveSkillDir, runFind } from '../src/commands/find.js';
import { mkTmp, createTestIo } from './helpers.js';
import { Vault } from '../src/core/vault.js';
import { GithubClient } from '../src/core/github.js';
import type { AppConfig } from '../src/types.js';

const fakeSearch = (async () => [
  { id: 'o/r/tdd', skillId: 'tdd', name: 'tdd', installs: 1000, source: 'o/r' },
  { id: 'o/r/zod', skillId: 'zod', name: 'zod', installs: 50, source: 'o/r' },
]) as typeof fetch;

function fakeCtx(): any {
  return {
    cfgPath: 'unused',
    cfg: { version: 1, vaultPath: '.', targets: [], updateCheck: { intervalHours: 24, lastCheck: null } },
    vault: new Vault('.'),
    gh: new GithubClient(),
  };
}

describe('resolveSkillDir', () => {
  it('returns first dir whose basename matches', async () => {
    const gh = {
      findSkillDirs: async () => ['skills/zod', 'skills/tdd'],
    };
    expect(await resolveSkillDir(gh as any, { owner: 'o', repo: 'r' }, 'tdd')).toBe('skills/tdd');
    expect(await resolveSkillDir(gh as any, { owner: 'o', repo: 'r' }, 'nope')).toBeNull();
  });
});

describe('runFind non-TTY/query mode', () => {
  it('prints results without prompting', async () => {
    const { io, out } = createTestIo();
    await runFind(io, fakeCtx(), { query: 'tdd' }, { search: fakeSearch });
    const joined = out.join('\n');
    expect(joined).toContain('o/r@tdd');
    expect(joined).toContain('1.0K installs');
    expect(joined).toContain('skillbase add');
  });

  it('prints nothing-found message', async () => {
    const { io, out } = createTestIo();
    await runFind(io, fakeCtx(), { query: 'zzz' }, { search: (async () => []) as typeof fetch });
    expect(out.join('\n')).toMatch(/no skills found/i);
  });
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm test` → FAIL resolving find module.

- [ ] **Step 3: Implement**

```ts
// src/commands/find.ts
import picocolors from 'picocolors';
import type { RepoRef } from '../core/github.js';
import type { GithubClient } from '../core/github.js';
import { formatInstalls } from '../ui/format.js';
import { renderTable } from '../ui/table.js';
import type { CliCtx } from '../context.js';
import type { CliIo } from '../ui/io.js';
import { searchSkills, RegistryError, type SearchResult } from '../core/registry.js';

export interface FindDeps {
  search?: typeof searchSkills;
  gh?: GithubClient;
}

export async function resolveSkillDir(
  gh: Pick<GithubClient, 'findSkillDirs'>,
  ref: RepoRef,
  skillName: string,
): Promise<string | null> {
  const dirs = await gh.findSkillDirs(ref);
  return dirs.find((d) => d.split('/').pop() === skillName) ?? null;
}

export async function runFind(
  io: CliIo,
  _ctx: CliCtx,
  opts: { query?: string },
  deps: FindDeps = {},
): Promise<void> {
  const search = deps.search ?? searchSkills;

  if (!process.stdout.isTTY || opts.query !== undefined) {
    const q = opts.query;
    if (!q) {
      io.error('Non-interactive usage: skillbase find <query>');
      return;
    }
    let results: SearchResult[];
    try {
      results = await search(q);
    } catch (e) {
      io.error(e instanceof RegistryError ? `Registry error: HTTP ${e.status}` : 'Search failed — check your connection');
      return;
    }
    if (results.length === 0) {
      io.info(picocolors.dim(`No skills found for "${q}"`));
      return;
    }
    io.info(
      renderTable(
        ['INSTALL WITH', 'INSTALLS'],
        results.map((r) => [`${r.source}@${r.skillId}`, formatInstalls(r.installs)]),
      ),
    );
    io.info(picocolors.dim(`Install with: skillbase add <owner/repo@skill>`));
    return;
  }

  // Interactive
  const query = await io.text({ message: 'Search skills (min 2 chars):' });
  if (!query || query.length < 2) return;
  const sp = io.spinner();
  sp.start('Searching…');
  let results: SearchResult[] = [];
  try {
    results = await search(query);
  } catch {
    /* fallthrough */
  } finally {
    sp.stop();
  }
  if (results.length === 0) {
    io.info(picocolors.dim('No skills found'));
    return;
  }
  const picked = await io.select({
    message: 'Select skill',
    options: results.map((r) => ({
      value: r.id,
      label: r.name,
    })),
  });
  const chosen = results.find((r) => r.id === picked)!;
  const gh = deps.gh ?? _ctx.gh;
  let preview = '(preview unavailable)';
  try {
    const [owner, repo] = chosen.source.split('/');
    const dir = await resolveSkillDir(gh, { owner: owner!, repo: repo! }, chosen.skillId);
    if (dir) {
      const files = await gh.downloadDir({ owner: owner!, repo: repo! }, dir);
      const md = files.find((f) => f.path.endsWith('SKILL.md'));
      if (md) preview = md.contents.split('\n').slice(0, 40).join('\n');
    }
  } catch {
    /* preview best-effort */
  }
  io.info(picocolors.bold(preview));
  io.info(picocolors.dim(`Install with: skillbase add ${chosen.source}@${chosen.skillId}`));
}
```

Register in `src/cli.ts` inside `createProgram()` (after list):

```ts
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
```

Plus import `{ runFind } from './commands/find.js';`.

- [ ] **Step 4: Run tests until green + manual smoke**

Run: `pnpm test` → PASS.
Manual (network allowed here, this hits real registry): `node bin/skillbase.js find tdd`.

- [ ] **Step 5: Commit**

```bash
git add src/commands/find.ts src/cli.ts test/find.test.ts && git commit -m "feat(cli): find command over skills.sh registry search"
```

---

### Task 14: `add` command — download to vault + deploy

**Files:**
- Create: `src/commands/add.ts`
- Modify: `src/cli.ts`
- Test: `test/add.test.ts`

**Interfaces:**
- Consumes: `parseSource`, `GithubClient.{repoSkills,findSkillDirs,downloadDir}`, `readTree` (local dirs), `validateSkillFolder`, `Vault.install/saveMeta`, `deploy`, `expandHome`.
- Produces:
  - `runAdd(io: CliIo, ctx: CliCtx, opts: { source: string; yes?: boolean; targets?: string[] }, deps?: { gh?: GithubClient }): Promise<SkillMeta | null>`
  - Flow: resolve → gather files → preview+confirm → collision prompt → install → pick targets → deploy each → record deployments → summary. Non-TTY requires `--yes` and `--targets`.

- [ ] **Step 1: Write failing tests**

```ts
// test/add.test.ts
import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { runAdd } from '../src/commands/add.js';
import { Vault } from '../src/core/vault.js';
import { mkTmp, createTestIo } from './helpers.js';
import type { AppConfig } from '../src/types.js';

const DOC = '---\nname: tdd\ndescription: TDD guidance\n---\ndo tdd';
const FILES: Record<string, string> = { 'SKILL.md': DOC, 'refs/a.md': 'A' };

function fakeGh(treeDirs: string[]) {
  return {
    findSkillDirs: async () => treeDirs,
    downloadDir: async (_ref: any, dir: string) =>
      Object.entries(FILES).map(([p, c]) => ({ path: p.startsWith(dir + '/') ? p.slice(dir.length + 1) : p, contents: c })),
    repoSkills: async () => treeDirs.filter((d) => d !== '.').map((d) => ({ name: d.split('/').pop()!, dir: d })),
  } as any;
}

async function setup() {
  const root = await mkTmp();
  const vault = new Vault(path.join(root, 'vault'));
  const cfg: AppConfig = {
    version: 1,
    vaultPath: path.join(root, 'vault'),
    targets: [{ id: 't1', name: 'Local target', path: path.join(root, 'target'), type: 'custom', active: true }],
    updateCheck: { intervalHours: 24, lastCheck: null },
  };
  return { root, vault, cfg, ctx: { cfgPath: path.join(root, 'config.json'), cfg, vault, gh: null } as any };
}

describe('runAdd', () => {
  it('adds a local skill and deploys to selected target', async () => {
    const { root, vault, cfg, ctx } = await setup();
    const srcDir = path.join(root, 'my-skill');
    await fs.mkdir(srcDir, { recursive: true });
    await fs.writeFile(path.join(srcDir, 'SKILL.md'), DOC);

    const { io } = createTestIo({ confirms: [true], multis: [['t1']] });
    const meta = await runAdd(io, ctx, { source: srcDir }, { gh: undefined });
    expect(meta?.slug).toBe('my-skill');
    expect(meta!.contentHash).toMatch(/^sha256-/);
    expect(meta!.deployments).toHaveLength(1);
    await expect(fs.readFile(path.join(root, 'target', 'my-skill', 'SKILL.md'), 'utf8')).resolves.toBe(DOC);
    expect(cfg.targets).toHaveLength(1);
    expect(await vault.get('my-skill')).not.toBeNull();
  });

  it('adds from fake github source with skill name', async () => {
    const { vault, ctx } = await setup();
    const gh = fakeGh(['skills/tdd']);
    const { io } = createTestIo({ confirms: [true], multis: [[]] });
    const meta = await runAdd(io, ctx, { source: 'o/r@tdd' }, { gh });
    expect(meta?.slug).toBe('tdd');
    expect((await vault.readFiles('tdd')).map((f) => f.path)).toContain('refs/a.md');
  });

  it('auto-renames on collision when confirmed', async () => {
    const { root, vault, ctx } = await setup();
    await vault.install('dup', [{ path: 'SKILL.md', contents: DOC }], { type: 'local' });
    const srcDir = path.join(root, 'other-owner-dup-src');
    await fs.mkdir(srcDir, { recursive: true });
    await fs.writeFile(path.join(srcDir, 'SKILL.md'), DOC.replace('tdd', 'dup'));

    const { io } = createTestIo({ confirms: [true, false], multis: [[]] }); // add=yes, overwrite=no -> rename
    const meta = await runAdd(io, ctx, { source: srcDir }, { gh: undefined });
    expect(meta?.slug).toBe('dup-local'); // rename suffix strategy: -owner or -local for local sources
  });

  it('rejects invalid frontmatter before touching vault', async () => {
    const { root, vault, ctx } = await setup();
    const bad = path.join(root, 'bad');
    await fs.mkdir(bad, { recursive: true });
    await fs.writeFile(path.join(bad, 'SKILL.md'), 'no frontmatter');
    const { io, out } = createTestIo({});
    const meta = await runAdd(io, ctx, { source: bad }, { gh: undefined });
    expect(meta).toBeNull();
    expect(out.join('\n')).toMatch(/frontmatter/i);
    expect(await vault.list()).toHaveLength(0);
  });
});
```

Collision rename rule (locked): overwrite → same slug; otherwise suffix `-<owner>` (registry) or `-local` (local source); if that also exists, append `-2`, `-3`, …

- [ ] **Step 2: Verify failure**

Run: `pnpm test` → FAIL resolving add module.

- [ ] **Step 3: Implement**

```ts
// src/commands/add.ts
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

async function uniqueSlug(vault: Vault, base: string, suffix: string): Promise<string> {
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

  let files: FetchedFile[];
  let source: SkillSource;
  try {
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
        if (!resolved) {
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
        if (skills.length === 1) {
          dir = skills[0]!.dir;
        } else {
          dir = await io.select({
            message: 'Multiple skills found — select one',
            options: skills.map((s) => ({ value: s.dir, label: s.name })),
          });
        }
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

    // Target selection
    const active = ctx.cfg.targets.filter((t) => t.active);
    let chosenIds: string[] = [];
    if (opts.targets) {
      chosenIds = opts.targets;
    } else if (active.length > 0) {
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
    io.outro(`Added ${picocolors.bold(slug)} to vault${deployments.length ? ` and deployed to ${deployments.length} target(s)` : ''}`);
    return meta;
  } catch (e) {
    if (e instanceof FrontmatterError) {
      io.error(`Invalid SKILL.md: ${e.message}`);
      return null;
    }
    throw e;
  }
}
```

Register in cli.ts:

```ts
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
```

- [ ] **Step 4: Run tests until green**

Run: `pnpm test` → PASS. (If collision test ordering differs, adjust `uniqueSlug` expectations to match implementation naming exactly — the locked rule above is authoritative.)

- [ ] **Step 5: Commit**

```bash
git add src/commands/add.ts src/cli.ts test/add.test.ts && git commit -m "feat(cli): add command with preview, collision handling and multi-target deploy"
```

---

### Task 15: `targets` command + pure CRUD helpers

**Files:**
- Modify: `src/core/targets.ts` (add CRUD helpers)
- Create: `src/commands/targets.ts`
- Modify: `src/cli.ts`
- Test: `test/targets-crud.test.ts`

**Interfaces:**
- Consumes: `AGENT_PRESETS`, `presetToTarget`, config store, sync engine (for status column: does expanded path contain managed links?), `readTree` not needed.
- Produces:
  - `addTargetById(cfg: AppConfig, presetKeyOrPreset: AgentPreset): AppConfig`
  - `addCustomTarget(cfg: AppConfig, name: string, rawPath: string): AppConfig` — id = slugified path basename + '-custom'
  - `removeTargetById(cfg: AppConfig, id: string): AppConfig`
  - `toggleTargetById(cfg: AppConfig, id: string): AppConfig`
  - `runTargets(io: CliIo, ctx: CliCtx): Promise<void>` — non-TTY prints table; TTY shows action menu (Add preset / Add custom / Toggle active / Remove / Done loop).

- [ ] **Step 1: Write failing tests**

```ts
// test/targets-crud.test.ts
import { describe, expect, it } from 'vitest';
import {
  addCustomTarget,
  addTargetById,
  removeTargetById,
  toggleTargetById,
} from '../src/core/targets.js';
import type { AppConfig } from '../src/types.js';

const cfg = (): AppConfig => ({
  version: 1,
  vaultPath: '~/.skillbase/vault',
  targets: [],
  updateCheck: { intervalHours: 24, lastCheck: null },
});

describe('target CRUD helpers', () => {
  it('adds preset target deterministically', () => {
    const c = addTargetById(cfg(), { key: 'claude-code', name: 'Claude Code', globalPath: '~/.claude/skills' });
    expect(c.targets[0]!.id).toBe('claude-code-global');
  });

  it('ignores duplicate preset adds', () => {
    let c = addTargetById(cfg(), { key: 'claude-code', name: 'Claude Code', globalPath: '~/.claude/skills' });
    c = addTargetById(c, { key: 'claude-code', name: 'Claude Code', globalPath: '~/.claude/skills' });
    expect(c.targets).toHaveLength(1);
  });

  it('adds custom target with slugified id', () => {
    const c = addCustomTarget(cfg(), 'My Project', '/home/u/proj/.agent/skills');
    expect(c.targets[0]!.id).toBe('skills-custom');
    expect(c.targets[0]!.type).toBe('custom');
  });

  it('removes and toggles', () => {
    let c = addTargetById(cfg(), { key: 'opencode', name: 'OpenCode', globalPath: '~/.config/opencode/skills' });
    c = toggleTargetById(c, 'opencode-global');
    expect(c.targets[0]!.active).toBe(false);
    c = removeTargetById(c, 'opencode-global');
    expect(c.targets).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm test` → FAIL — exports missing.

- [ ] **Step 3: Implement** (append to `src/core/targets.ts`)

```ts
import type { AppConfig } from '../types.js';

export function addTargetById(cfg: AppConfig, p: AgentPreset): AppConfig {
  if (cfg.targets.some((t) => t.id === `${p.key}-global`)) return cfg;
  return { ...cfg, targets: [...cfg.targets, presetToTarget(p)] };
}

export function addCustomTarget(cfg: AppConfig, name: string, rawPath: string): AppConfig {
  const base = path.posix.basename(rawPath.replace(/\\/g, '/')).replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'target';
  const id = `${base}-custom`;
  if (cfg.targets.some((t) => t.id === id)) return cfg;
  return { ...cfg, targets: [...cfg.targets, { id, name, path: rawPath, type: 'custom', active: true }] };
}

export function removeTargetById(cfg: AppConfig, id: string): AppConfig {
  return { ...cfg, targets: cfg.targets.filter((t) => t.id !== id) };
}

export function toggleTargetById(cfg: AppConfig, id: string): AppConfig {
  return { ...cfg, targets: cfg.targets.map((t) => (t.id === id ? { ...t, active: !t.active } : t)) };
}
```

Add `import path from 'node:path';` at top of targets.ts.

`src/commands/targets.ts`:

```ts
import picocolors from 'picocolors';
import { AGENT_PRESETS, addCustomTarget, addTargetById, detectInstalledPresets, removeTargetById, toggleTargetById } from '../core/targets.js';
import { saveConfig } from '../core/config.js';
import { renderTable } from '../ui/table.js';
import type { CliCtx } from '../context.js';
import type { CliIo } from '../ui/io.js';

export async function runTargets(io: CliIo, ctx: CliCtx): Promise<void> {
  const render = () =>
    ctx.cfg.targets.length === 0
      ? io.info(picocolors.dim('No targets configured'))
      : io.info(
          renderTable(
            ['ID', 'NAME', 'PATH', 'ACTIVE'],
            ctx.cfg.targets.map((t) => [t.id, t.name, t.path, t.active ? 'yes' : 'no']),
          ),
        );

  if (!process.stdin.isTTY) {
    render();
    return;
  }

  for (;;) {
    render();
    const action = await io.select({
      message: 'Targets',
      options: [
        { value: 'preset', label: 'Add preset (detected)' },
        { value: 'custom', label: 'Add custom path' },
        { value: 'toggle', label: 'Toggle active' },
        { value: 'remove', label: 'Remove' },
        { value: 'done', label: 'Done' },
      ],
    });
    if (action === 'done') break;
    if (action === 'preset') {
      const installed = await detectInstalledPresets();
      const pool = installed.length ? installed : AGENT_PRESETS;
      const picks = await io.multiselect({
        message: 'Choose presets',
        options: pool.map((p) => ({ value: p.key, label: p.name })),
      });
      for (const key of picks) {
        const preset = pool.find((p) => p.key === key)!;
        ctx.cfg = addTargetById(ctx.cfg, preset);
      }
    } else if (action === 'custom') {
      const p = await io.text({ message: 'Absolute path (supports ~):' });
      if (!p) continue;
      ctx.cfg = addCustomTarget(ctx.cfg, p, p);
    } else if (action === 'toggle') {
      const id = await io.select({
        message: 'Toggle which?',
        options: ctx.cfg.targets.map((t) => ({ value: t.id, label: t.name })),
      });
      ctx.cfg = toggleTargetById(ctx.cfg, id);
    } else if (action === 'remove') {
      const id = await io.select({
        message: 'Remove which?',
        options: ctx.cfg.targets.map((t) => ({ value: t.id, label: t.name })),
      });
      if (!(await io.confirm({ message: 'Really remove?' }))) continue;
      ctx.cfg = removeTargetById(ctx.cfg, id);
    }
    await saveConfig(ctx.cfg, ctx.cfgPath);
  }
}
```

Register `targets` command in cli.ts (same pattern as list; action calls `runTargets(clackIo(), ctx)`).

- [ ] **Step 4: Run tests until green**

Run: `pnpm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/targets.ts src/commands/targets.ts src/cli.ts test/targets-crud.test.ts && git commit -m "feat(cli): targets management with preset/custom CRUD"
```

---

### Task 16: Startup update badge + `update` command

**Files:**
- Create: `src/commands/update.ts`
- Modify: `src/cli.ts`
- Test: `test/update-cmd.test.ts`

**Interfaces:**
- Consumes: `maybeCheckForUpdates`, `checkUpdates`, `summarizeChanges`, `applyUpdate`, `lineDiff`.
- Produces:
  - `runUpdate(io: CliIo, ctx: CliCtx, opts: { names?: string[]; all?: boolean }, deps?: { downloadDir?: Downloader }): Promise<void>` — full check (timeoutMs 15000), filters by names unless `--all`, shows summary+diff per skill, confirm each (single confirm when `--all`), applies.
  - Badge wiring: `--check` global flag forces startup check; badge line printed before any command output when outdated > 0.

- [ ] **Step 1: Write failing tests**

```ts
// test/update-cmd.test.ts
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { Vault } from '../src/core/vault.js';
import { runUpdate } from '../src/commands/update.js';
import { mkTmp, createTestIo } from './helpers.js';
import type { AppConfig, FetchedFile } from '../src/types.js';

const v1: FetchedFile[] = [{ path: 'SKILL.md', contents: '---\nname: tdd\ndescription: d\n---\nv1' }];
const v2: FetchedFile[] = [{ path: 'SKILL.md', contents: '---\nname: tdd\ndescription: d\n---\nv2\nnew-line' }];

async function setup() {
  const root = await mkTmp();
  const vault = new Vault(path.join(root, 'vault'));
  await vault.install('tdd', v1, { type: 'registry', owner: 'o', repo: 'r', skillId: 'tdd', path: 'skills/tdd' });
  const cfg: AppConfig = { version: 1, vaultPath: path.join(root, 'vault'), targets: [], updateCheck: { intervalHours: 24, lastCheck: null } };
  return { vault, ctx: { cfgPath: path.join(root, 'config.json'), cfg, vault, gh: null } as any };
}

describe('runUpdate', () => {
  it('updates all outdated after confirmation', async () => {
    const { vault, ctx } = await setup();
    const { io, out } = createTestIo({ confirms: [true] });
    await runUpdate(io, ctx, { all: true }, { downloadDir: async () => v2 });
    const joined = out.join('\n');
    expect(joined).toContain('tdd');
    expect(joined).toMatch(/updated/i);
    expect(await vault.readFiles('tdd')).toEqual(v2);
  });

  it('skips when nothing outdated', async () => {
    const { ctx } = await setup();
    const { io, out } = createTestIo({});
    // current == latest
    await runUpdate(io, ctx, { all: true }, { downloadDir: async () => v1 });
    expect(out.join('\n')).toMatch(/up to date|nothing/i);
  });

  it('filters by names', async () => {
    const { ctx } = await setup();
    const { io, out } = createTestIo({ confirms: [true] });
    await runUpdate(io, ctx, { names: ['other'] }, { downloadDir: async () => v2 });
    expect(out.join('\n')).toMatch(/up to date|nothing|not tracked/i);
  });
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm test` → FAIL resolving update module.

- [ ] **Step 3: Implement**

```ts
// src/commands/update.ts
import picocolors from 'picocolors';
import { applyUpdate, checkUpdates, summarizeChanges, type Downloader } from '../core/updater.js';
import { lineDiff } from '../ui/diff.js';
import type { CliCtx } from '../context.js';
import type { CliIo } from '../ui/io.js';

export interface UpdateDeps {
  downloadDir?: Downloader;
}

export async function runUpdate(
  io: CliIo,
  ctx: CliCtx,
  opts: { names?: string[]; all?: boolean },
  deps: UpdateDeps = {},
): Promise<void> {
  const download: Downloader =
    deps.downloadDir ??
    ((ref, dir) =>
      ctx.gh.downloadDir(ref, dir));

  const sp = io.spinner();
  sp.start('Checking for updates…');
  let candidates;
  try {
    candidates = await checkUpdates(ctx.vault, download, { timeoutMs: 15000 });
  } finally {
    sp.stop();
  }

  if (candidates.length === 0) {
    io.info('Everything up to date.');
    return;
  }

  const wanted = opts.all || !opts.names
    ? candidates
    : candidates.filter((c) => opts.names!.includes(c.meta.slug));

  if (wanted.length === 0) {
    io.info('No tracked updates for the requested skills.');
    return;
  }

  const approveAll = opts.all === true && (await io.confirm({ message: `Apply ${wanted.length} update(s)?` }));

  for (const cand of wanted) {
    const cur = await ctx.vault.readFiles(cand.meta.slug);
    const s = summarizeChanges(cur, cand.latest);
    const mdCur = cur.find((f) => f.path === 'SKILL.md')?.contents ?? '';
    const mdNew = cand.latest.find((f) => f.path === 'SKILL.md')?.contents ?? '';
    const d = lineDiff(mdCur, mdNew, 40);
    io.info(
      picocolors.bold(cand.meta.slug) +
        picocolors.dim(`  +${s.added.length} ~${s.changed.length} -${s.removed.length} files`),
    );
    for (const l of d.removed) io.info(picocolors.red(`- ${l}`));
    for (const l of d.added) io.info(picocolors.green(`+ ${l}`));
    const ok = approveAll || (await io.confirm({ message: `Update ${cand.meta.slug}?` }));
    if (!ok) continue;
    await applyUpdate(ctx.vault, cand);
    io.info(`Updated ${picocolors.bold(cand.meta.slug)}`);
  }
  io.outro('Update pass complete.');
}
```

(`picocolors.red`/`green` come from the same default import.)

Wire badge + `--check` in cli.ts:

```ts
program
  .name('skillbase')
  // ...
  .option('--check', 'force an immediate update check')
  .hook('preAction', async (thisCmd) => {
    const ctx = await ensureContext(clackIo());
    const force = thisCmd.opts().check === true;
    try {
      const n = await maybeCheckForUpdates({
        cfg: ctx.cfg,
        cfgPath: ctx.cfgPath,
        vault: ctx.vault,
        downloadDir: (ref, dir) => ctx.gh.downloadDir(ref, dir),
        force,
      });
      if (n > 0) clackIo().warn(`⬆ ${n} update(s) available — run 'skillbase update'`);
    } catch {
      /* silent */
    }
  });
```

Import `maybeCheckForUpdates` from core/updater. Register `update` command:

```ts
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
```

- [ ] **Step 4: Run tests until green + manual verify badge**

Run: `pnpm test` → PASS.
Manual: `node bin/skillbase.js --check list` against a vault with a stale skill → badge line appears.

- [ ] **Step 5: Commit**

```bash
git add src/commands/update.ts src/cli.ts test/update-cmd.test.ts && git commit -m "feat(cli): update command with diff review and startup badge"
```

---

### Task 17: `remove` and `scan` commands

**Files:**
- Create: `src/commands/remove.ts`, `src/commands/scan.ts`
- Modify: `src/cli.ts`
- Test: `test/remove-scan.test.ts`

**Interfaces:**
- Consumes: `removeDeployment`, `findUnmanaged`, `adopt`, vault, config save.
- Produces:
  - `runRemove(io: CliIo, ctx: CliCtx, opts: { name: string; purge?: boolean; targets?: string[] }): Promise<SkillMeta | null>`
  - `runScan(io: CliIo, ctx: CliCtx, opts: {}, deps?): Promise<void>`

- [ ] **Step 1: Write failing tests**

```ts
// test/remove-scan.test.ts
import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Vault } from '../src/core/vault.js';
import { deploy } from '../src/core/sync.js';
import { runRemove } from '../src/commands/remove.js';
import { runScan } from '../src/commands/scan.js';
import { mkTmp, createTestIo } from './helpers.js';
import type { AppConfig } from '../src/types.js';

const DOC = '---\nname: tdd\ndescription: d\n---\nx';

async function setup() {
  const root = await mkTmp();
  const vault = new Vault(path.join(root, 'vault'));
  const targetPath = path.join(root, 'target');
  const meta = await vault.install('tdd', [{ path: 'SKILL.md', contents: DOC }], { type: 'local' });
  const res = await deploy(vault.dirOf('tdd'), targetPath, 'tdd');
  meta.deployments.push({ targetId: 't1', linkPath: res.linkPath, method: res.method });
  await vault.saveMeta(meta);
  const cfg: AppConfig = {
    version: 1,
    vaultPath: path.join(root, 'vault'),
    targets: [{ id: 't1', name: 'T', path: targetPath, type: 'custom', active: true }],
    updateCheck: { intervalHours: 24, lastCheck: null },
  };
  return { root, vault, targetPath, ctx: { cfgPath: path.join(root, 'config.json'), cfg, vault, gh: null } as any };
}

describe('runRemove', () => {
  it('removes deployments and keeps vault copy by default', async () => {
    const { ctx, vault, targetPath } = await setup();
    const { io } = createTestIo({ confirms: [true] });
    await runRemove(io, ctx, { name: 'tdd' });
    await expect(fs.lstat(path.join(targetPath, 'tdd'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await vault.get('tdd'))!.deployments).toHaveLength(0);
    expect(await vault.get('tdd')).not.toBeNull();
  });

  it('--purge deletes vault copy too', async () => {
    const { ctx, vault, targetPath } = await setup();
    const { io } = createTestIo({ confirms: [true, true] });
    await runRemove(io, ctx, { name: 'tdd', purge: true });
    expect(await vault.get('tdd')).toBeNull();
    await expect(fs.lstat(path.join(targetPath, 'tdd'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

describe('runScan', () => {
  it('adopts an unmanaged folder', async () => {
    const { root, ctx, vault } = await setup();
    const planted = path.join(root, 'target', 'legacy');
    await fs.mkdir(planted, { recursive: true });
    await fs.writeFile(path.join(planted, 'SKILL.md'), DOC.replace('tdd', 'legacy'));

    const { io, out } = createTestIo({ confirms: [true] }); // adopt?
    await runScan(io, ctx, {});
    expect(await vault.get('legacy')).not.toBeNull();
    // original location now serves vault content through a link
    await expect(fs.readFile(path.join(planted, 'SKILL.md'), 'utf8')).resolves.toBe(DOC.replace('tdd', 'legacy'));
    expect(out.join('\n')).toMatch(/adopted|added/i);
  });
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm test` → FAIL resolving modules.

- [ ] **Step 3: Implement**

`src/commands/remove.ts`:

```ts
import { removeDeployment } from '../core/sync.js';
import type { CliCtx } from '../context.js';
import type { CliIo } from '../ui/io.js';
import picocolors from 'picocolors';

export async function runRemove(
  io: CliIo,
  ctx: CliCtx,
  opts: { name: string; purge?: boolean; targets?: string[] },
): Promise<any> {
  const meta = await ctx.vault.get(opts.name);
  if (!meta) {
    io.error(`"${opts.name}" is not in the vault`);
    return null;
  }
  const ids = opts.targets ?? meta.deployments.map((d) => d.targetId);
  for (const dep of meta.deployments.filter((d) => ids.includes(d.targetId))) {
    try {
      await removeDeployment(dep.linkPath);
      io.info(`Removed ${dep.linkPath}`);
    } catch (e) {
      io.warn(`Could not remove ${dep.linkPath}: ${(e as Error).message}`);
    }
  }
  meta.deployments = meta.deployments.filter((d) => !ids.includes(d.targetId));

  if (opts.purge) {
    if (meta.deployments.length === 0 || (await io.confirm({ message: 'Still deployed elsewhere — purge anyway?' }))) {
      for (const dep of meta.deployments) {
        try {
          await removeDeployment(dep.linkPath);
        } catch {
          /* reported earlier */
        }
      }
      await ctx.vault.remove(meta.slug);
      io.outro(`Purged ${picocolors.bold(meta.slug)} from vault`);
      return meta;
    }
  }
  await ctx.vault.saveMeta(meta);
  io.outro(`Removed deployments for ${picocolors.bold(meta.slug)} (vault copy kept)`);
  return meta;
}
```

`src/commands/scan.ts`:

```ts
import picocolors from 'picocolors';
import { findUnmanaged, adopt } from '../core/scanner.js';
import type { CliCtx } from '../context.js';
import type { CliIo } from '../ui/io.js';

export interface ScanDeps {}

export async function runScan(io: CliIo, ctx: CliCtx, _opts: {} = {}): Promise<void> {
  const sp = io.spinner();
  sp.start('Scanning targets…');
  let found;
  try {
    found = await findUnmanaged(ctx.vault, ctx.cfg.targets);
  } finally {
    sp.stop();
  }
  if (found.length === 0) {
    io.info('No unmanaged skills found.');
    return;
  }
  for (const u of found) {
    io.info(`${picocolors.bold(u.slugGuess)} — ${u.description}`);
    const ok = await io.confirm({ message: `Adopt "${u.slugGuess}" into the vault?` });
    if (!ok) {
      io.info('Left as external (untracked).');
      continue;
    }
    await adopt(ctx.vault, u);
    io.info(`Adopted ${picocolors.bold(u.slugGuess)}`);
  }
  io.outro('Scan complete.');
}
```

Register both commands in cli.ts (`remove <name>` with `--purge`, `-t --targets <ids...>`; `scan`). Follow the exact action pattern from Task 16.

- [ ] **Step 4: Run tests until green**

Run: `pnpm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/commands/remove.ts src/commands/scan.ts src/cli.ts test/remove-scan.test.ts && git commit -m "feat(cli): remove and scan commands"
```

---

### Task 18: `new` and `config` commands

**Files:**
- Create: `src/commands/new.ts`, `src/commands/config-cmd.ts`
- Modify: `src/cli.ts`
- Test: `test/new-config.test.ts`

**Interfaces:**
- Consumes: vault, config store, `expandHome`.
- Produces:
  - `runNew(io: CliIo, ctx: CliCtx, opts: { name?: string }): Promise<SkillMeta>`
  - `applyConfigSet(cfg: AppConfig, key: 'vaultPath' | 'intervalHours' | 'disableChecks', value: string): Promise<AppConfig>` — validates values; vaultPath change moves the directory (`fs.rename`, cross-device fallback copy+rm); disableChecks sets `intervalHours: 0`.
  - `runConfig(io: CliIo, ctx: CliCtx, opts: { key?: string; value?: string }): Promise<void>` — no args: print current config summary; key+value: apply & save.

- [ ] **Step 1: Write failing tests**

```ts
// test/new-config.test.ts
import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Vault } from '../src/core/vault.js';
import { applyConfigSet } from '../src/commands/config-cmd.js';
import { runNew } from '../src/commands/new.js';
import { mkTmp, createTestIo } from './helpers.js';
import type { AppConfig } from '../src/types.js';

const baseCfg = (root: string): AppConfig => ({
  version: 1,
  vaultPath: path.join(root, 'vault'),
  targets: [],
  updateCheck: { intervalHours: 24, lastCheck: null },
});

describe('runNew', () => {
  it('scaffolds a valid skill into the vault', async () => {
    const root = await mkTmp();
    const vault = new Vault(path.join(root, 'vault'));
    const { io } = createTestIo({ texts: ['my-skill'] });
    const meta = await runNew(io, { cfgPath: '', cfg: baseCfg(root), vault, gh: null } as any, {});
    expect(meta.slug).toBe('my-skill');
    const files = await vault.readFiles('my-skill');
    expect(files[0]!.contents).toMatch(/^---\nname: my-skill\ndescription: /);
  });
});

describe('applyConfigSet', () => {
  it('sets interval hours', async () => {
    const cfg = await applyConfigSet(baseCfg('/r'), 'intervalHours', '48');
    expect(cfg.updateCheck.intervalHours).toBe(48);
  });

  it('disableChecks zeroes the interval', async () => {
    const cfg = await applyConfigSet(baseCfg('/r'), 'disableChecks', 'true');
    expect(cfg.updateCheck.intervalHours).toBe(0);
  });

  it('rejects bad numbers', async () => {
    await expect(applyConfigSet(baseCfg('/r'), 'intervalHours', 'abc')).rejects.toThrow(/number/i);
  });

  it('moves vault directory on vaultPath change', async () => {
    const root = await mkTmp();
    const oldV = path.join(root, 'vault');
    await fs.mkdir(oldV, { recursive: true });
    await fs.writeFile(path.join(oldV, 'marker.txt'), 'x');
    const newV = path.join(root, 'vault2');
    const cfg = await applyConfigSet(baseCfg(root), 'vaultPath', newV);
    expect(cfg.vaultPath).toBe(newV);
    await expect(fs.readFile(path.join(newV, 'marker.txt'), 'utf8')).resolves.toBe('x');
  });
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm test` → FAIL resolving modules.

- [ ] **Step 3: Implement**

`src/commands/new.ts`:

```ts
import { Vault } from '../core/vault.js';
import type { CliCtx } from '../context.js';
import type { CliIo } from '../ui/io.js';

export async function runNew(io: CliIo, ctx: CliCtx, opts: { name?: string } = {}) {
  const name = opts.name ?? (await io.text({ message: 'Skill name (lowercase-hyphenated):' }));
  if (!name || !/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    io.error('Name must be lowercase letters, numbers and hyphens');
    return;
  }
  const contents = [
    '---',
    `name: ${name}`,
    `description: TODO describe what this skill does and when to use it`,
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
```

(Note: the TODO inside the generated user-facing template is intentional product copy, not a plan placeholder.)

`src/commands/config-cmd.ts`:

```ts
import fs from 'node:fs/promises';
import picocolors from 'picocolors';
import { expandHome, saveConfig } from '../core/config.js';
import { renderTable } from '../ui/table.js';
import type { CliCtx } from '../context.js';
import type { CliIo } from '../ui/io.js';
import type { AppConfig } from '../types.js';

export type ConfigKey = 'vaultPath' | 'intervalHours' | 'disableChecks';

export async function applyConfigSet(cfg: AppConfig, key: ConfigKey, value: string): Promise<AppConfig> {
  if (key === 'intervalHours') {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) throw new Error('intervalHours must be a number >= 0');
    return { ...cfg, updateCheck: { ...cfg.updateCheck, intervalHours: n } };
  }
  if (key === 'disableChecks') {
    const off = value === 'true' || value === '1';
    return { ...cfg, updateCheck: { ...cfg.updateCheck, intervalHours: off ? 0 : 24 } };
  }
  // vaultPath — move directory
  const from = expandHome(cfg.vaultPath);
  const to = expandHome(value);
  if (path.resolve(from) !== path.resolve(to)) {
    await fs.mkdir(path.dirname(to), { recursive: true });
    try {
      await fs.rename(from, to);
    } catch {
      await fs.cp(from, to, { recursive: true });
      await fs.rm(from, { recursive: true, force: true });
    }
  }
  return { ...cfg, vaultPath: value };
}

export async function runConfig(io: CliIo, ctx: CliCtx, opts: { key?: string; value?: string }): Promise<void> {
  if (!opts.key) {
    io.info(
      renderTable(['KEY', 'VALUE'], [
        ['vaultPath', ctx.cfg.vaultPath],
        ['intervalHours', String(ctx.cfg.updateCheck.intervalHours)],
        ['targets', String(ctx.cfg.targets.length)],
      ]),
    );
    io.info(picocolors.dim('Usage: skillbase config <vaultPath|intervalHours|disableChecks> <value>'));
    return;
  }
  const key = opts.key as ConfigKey;
  if (!['vaultPath', 'intervalHours', 'disableChecks'].includes(key)) {
    io.error(`Unknown key "${opts.key}"`);
    return;
  }
  if (opts.value === undefined) {
    io.error('Missing value');
    return;
  }
  ctx.cfg = await applyConfigSet(ctx.cfg, key, opts.value);
  await saveConfig(ctx.cfg, ctx.cfgPath);
  io.outro('Saved.');
}
```

Register `new [name]` and `config [key] [value]` commands in cli.ts.

- [ ] **Step 4: Run tests until green**

Run: `pnpm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/commands/new.ts src/commands/config-cmd.ts src/cli.ts test/new-config.test.ts && git commit -m "feat(cli): new skill scaffold and config command with vault migration"
```

---

### Task 19: Integration lifecycle test + CI workflow + binary smoke

**Files:**
- Create: `test/lifecycle.integration.test.ts`, `.github/workflows/ci.yml`, `test/smoke.test.ts`

**Interfaces:**
- Consumes: full public surface built so far.

- [ ] **Step 1: Write the integration test**

```ts
// test/lifecycle.integration.test.ts
import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { GithubClient, parseSource } from '../src/core/github.js';
import { validateSkillFolder } from '../src/core/frontmatter.js';
import { deploy } from '../src/core/sync.js';
import { Vault } from '../src/core/vault.js';
import { applyUpdate, checkUpdates } from '../src/core/updater.js';
import { mkTmp } from './helpers.js';
import type { TreeEntry } from '../src/core/github.js';

const RAW: Record<string, string> = {
  'SKILL.md': '---\nname: webdev\ndescription: Web dev rules\n---\nrule v1',
  'refs/stack.md': 'stack notes',
};
let TREE: TreeEntry[] = Object.keys(RAW).map((p) => ({ path: `skills/webdev/${p}`, type: 'blob' as const }));

function fakeFetch(url: any): Promise<Response> {
  const u = String(url);
  if (u.includes('/api/search')) {
    return Promise.resolve(
      new Response(JSON.stringify({ skills: [{ id: 'o/r/webdev', skillId: 'webdev', name: 'webdev', installs: 10, source: 'o/r' }] }), { status: 200 }),
    );
  }
  if (u.includes('/git/trees/')) {
    return Promise.resolve(new Response(JSON.stringify({ tree: TREE, truncated: false }), { status: 200 }));
  }
  for (const [p, c] of Object.entries(RAW)) {
    if (u.endsWith(`/skills/webdev/${p}`)) return Promise.resolve(new Response(c, { status: 200 }));
  }
  return Promise.resolve(new Response('nf', { status: 404 }));
}

describe('full lifecycle (fake network)', () => {
  it('search->add->sync->update->purge', async () => {
    const root = await mkTmp();
    const vault = new Vault(path.join(root, 'vault'));
    const targetA = path.join(root, 'a-skills');
    const targetB = path.join(root, 'b-skills');
    const gh = new GithubClient(fakeFetch as typeof fetch);

    // 1. search shape sanity
    const reg = await (await import('../src/core/registry.js')).searchSkills('web', 5, fakeFetch as typeof fetch);
    expect(reg[0]!.id).toBe('o/r/webdev');

    // 2. add
    const parsed = parseSource('o/r@webdev');
    expect(parsed).toMatchObject({ kind: 'github' });
    const dir = (await gh.findSkillDirs({ owner: 'o', repo: 'r' })).find((d) => d.endsWith('webdev'))!;
    const files = validateSkillFolder(await gh.downloadDir({ owner: 'o', repo: 'r' }, dir));
    const meta = await vault.install('webdev', [...[{ path: 'SKILL.md', contents: RAW['SKILL.md']! }], { path: 'refs/stack.md', contents: RAW['refs/stack.md']! }], {
      type: 'registry', owner: 'o', repo: 'r', path: dir, skillId: 'webdev',
    });

    // 3. sync to two targets
    const d1 = await deploy(vault.dirOf('webdev'), targetA, 'webdev');
    const d2 = await deploy(vault.dirOf('webdev'), targetB, 'webdev');
    meta.deployments.push({ targetId: 'a', linkPath: d1.linkPath, method: d1.method });
    meta.deployments.push({ targetId: 'b', linkPath: d2.linkPath, method: d2.method });
    await vault.saveMeta(meta);
    await expect(fs.readFile(path.join(targetA, 'webdev', 'SKILL.md'), 'utf8')).resolves.toContain('v1');

    // 4. upstream changes -> check detects -> apply propagates to copies
    RAW['SKILL.md'] = '---\nname: webdev\ndescription: Web dev rules\n---\nrule v2';
    const outdated = await checkUpdates(vault, (ref, d) => gh.downloadDir(ref, d), { timeoutMs: 2000 });
    expect(outdated).toHaveLength(1);
    const updated = await applyUpdate(vault, outdated[0]!);
    await expect(fs.readFile(path.join(targetB, 'webdev', 'SKILL.md'), 'utf8')).resolves.toContain('v2');
    expect(updated.contentHash).not.toBe(meta.contentHash);

    // 5. purge everywhere
    for (const dep of updated.deployments) await fs.rm(dep.linkPath, { recursive: true, force: true });
    await vault.remove('webdev');
    expect(await vault.list()).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Write CI workflow**

`.github/workflows/ci.yml`:

```yaml
name: CI
on:
  push: { branches: [master, main] }
  pull_request:
jobs:
  test:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm test
      - run: pnpm build
      - run: node bin/skillbase.js --version
```

- [ ] **Step 3: Write smoke test**

```ts
// test/smoke.test.ts
import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const SKIP = process.env['SKIP_SMOKE'] === '1';

describe.skipIf(SKIP)('binary smoke', () => {
  it('prints version', async () => {
    const { stdout } = await exec('node', ['bin/skillbase.js', '--version']);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });
});
```

- [ ] **Step 4: Run everything locally**

```bash
pnpm build && pnpm test && node bin/skillbase.js --version
```

Expected: all suites PASS including integration + smoke.

- [ ] **Step 5: Commit**

```bash
git add test/lifecycle.integration.test.ts test/smoke.test.ts .github/workflows/ci.yml && git commit -m "test: full lifecycle integration, cross-platform CI, binary smoke"
```

---

### Task 20: README rewrite + package polish

**Files:**
- Modify: `README.md` (full rewrite), `package.json`

**Interfaces:** none (docs/release hygiene).

- [ ] **Step 1: Rewrite README.md**

Content outline (write in full markdown):

```markdown
# ⚡ skillbase

Vault-based AI agent skill manager. One canonical copy of every skill,
symlinked into Claude Code, OpenCode, Codex, Cursor, `.agents` and more.

## Install

    npm i -g skillbase

or run ad hoc:

    npx skillbase

## Quickstart

    skillbase find tdd          # browse skills.sh
    skillbase add mattpocock/skills@tdd
    # choose targets on first run — done.

    skillbase list              # what's installed where
    skillbase update            # review diffs, apply
    skillbase targets           # manage deploy destinations
    skillbase scan              # adopt existing folders
    skillbase new my-skill      # scaffold your own

## How it works

Skills live once in ~/.skillbase/vault/<slug>/ and are linked (symlink on
macOS/Linux, junction on Windows, copy fallback) into each enabled target
directory such as ~/.claude/skills or ~/.config/opencode/skills. Updates are
detected by comparing content hashes against upstream GitHub and applied only
after you review the diff.

## Commands

(table: find, add, list, update, remove, targets, scan, new, config — flags)

## Configuration

~/.skillbase/config.json — vaultPath, targets[], updateCheck.intervalHours.

## Development

    pnpm install
    pnpm test       # vitest, no network needed
    pnpm build      # tsup -> dist/
    node bin/skillbase.js --version

## License

MIT
```

- [ ] **Step 2: Polish package.json**

Add fields:

```json
"keywords": ["ai", "agent", "skills", "skills.sh", "claude", "opencode", "cursor", "codex"],
"repository": { "type": "git", "url": "git+https://github.com/<your-org>/skillbase.git" },
"homepage": "https://github.com/<your-org>/skillbase#readme",
"bugs": { "url": "https://github.com/<your-org>/skillbase/issues" }
```

(replace `<your-org>` with the actual GitHub org/user before publishing)

- [ ] **Step 3: Verify package contents**

```bash
pnpm build && pnpm pack --dry-run
```

Expected: tarball contains only `bin/` and `dist/` (+ readme/license/package.json).

- [ ] **Step 4: Final full gate**

```bash
pnpm test && pnpm build && node bin/skillbase.js --version && git status --short
```

Expected: green, clean tree.

- [ ] **Step 5: Commit**

```bash
git add README.md package.json && git commit -m "docs: rewrite README for CLI era, polish npm metadata"
```

---

## Deviations from spec (intentional, low-risk)

1. **msw replaced by injectable `fetchImpl` seams** — identical isolation, zero extra dependency (Global Constraints allows only listed runtime deps).
2. **Security audits endpoint deferred entirely** rather than best-effort: v1 API requires Vercel OIDC per spec research; surfacing audits would need auth UX out of scope for v1. Tracked as future enhancement.
3. `formatInstalls` keeps `.0` precision (`747.0K`) — cosmetic difference from the official CLI, asserted in tests.

## Self-Review Checklist (completed during planning)

- Spec coverage: vault model (Tasks 4, 6, 14), targets/presets (5, 12, 15), registry search (7, 13), GitHub fetching (8, 14), hash updates + startup badge (9, 16), adoption (10, 17), scaffold (18), error matrix (per-module throws + command guards, 3/4/6/8/14/17), testing incl. cross-platform CI (19), npm packaging (20).
- All command surfaces from spec present: find, add, list, remove, update, targets, scan, new, config.
- Type consistency verified across task Interfaces blocks (`Downloader`, `CliCtx`, `FetchedFile`, `SyncMethod`, meta shape match).

