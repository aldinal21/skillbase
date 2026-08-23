# SkillBase CLI — Complete Rewrite Design

**Date**: 2026-08-23
**Status**: Draft for review
**Supersedes**: `2026-08-13-skillbase-design.md`, `2026-08-13-universal-agent-skills-design.md` (Go/web era)

---

## Summary

SkillBase is rewritten as a **pure CLI/TUI tool distributed as an npm package named `skillbase`** (name verified available on npm). It manages AI agent skills on the local machine using a **central vault model**: every skill lives once in a configurable vault directory and is deployed to any number of agent targets (`.agents/skills`, Claude Code, OpenCode, custom paths) via symlink/junction/copy.

The previous Go + Echo + SQLite + HTMX web application is removed. The rewrite happens **in this repository**; git history is preserved.

Core value proposition versus the official `skills` CLI:

1. **Vault-first**: one canonical copy per skill, updates propagate to all targets at once.
2. **Update management**: content-hash tracking with startup auto-check and reviewed diffs before applying.
3. **Target management**: explicit, persistent target registry with presets for 80+ known agents.
4. **Adoption**: existing skill folders found in agent directories can be adopted into the vault.

## Decisions (agreed during brainstorming)

| Decision | Choice |
|---|---|
| Distribution | npm package `skillbase`, pure CLI/TUI |
| Language / runtime | TypeScript on Node.js (>= 20), pnpm |
| TUI stack | Commander (arg parsing) + `@clack/prompts` (interactive flows), picocolors for styling |
| Storage model | Central vault, location configurable |
| Update behavior | Auto-check on startup (non-blocking), apply only after user reviews diff |
| Architecture | Single package, modular internals (`commands/` thin layer over pure `core/`) |
| Registry access | Unauthenticated `skills.sh/api/search`; skill contents fetched from GitHub |
| Old Go code | Deleted; history retained |

---

## Registry & Network Interfaces

| Need | Mechanism | Auth |
|---|---|---|
| Search registry | `GET https://skills.sh/api/search?q=<query>&limit=<n>` → JSON `{ skills: [{ id, skillId, name, installs, source }] }` | None (verified working) |
| Fetch skill contents | GitHub Trees API (`GET /repos/<owner>/<repo>/git/trees/<ref>?recursive=1`) to locate the skill folder, then raw.githubusercontent.com for each file | Anonymous (60 req/hr); optional `GITHUB_TOKEN`/`GH_TOKEN` raise limits and enable private repos |
| Detect upstream changes | SHA-256 over sorted `(path, contents)` pairs of the skill folder, compared against hash stored at install time | — |
| Security audits (optional, best-effort) | `GET https://skills.sh/api/v1/skills/audit/{source}/{skill}` — shown when available; skipped silently otherwise | Requires Vercel OIDC; feature is opportunistic and never blocks |

Source formats accepted by `add`: `owner/repo@skill`, GitHub URL (repo or tree URL), plain `owner/repo` (lists contained skills interactively), local path.

Agent preset catalog (name, global path, project path) mirrors the official ecosystem table (Claude Code `~/.claude/skills`, OpenCode `~/.config/opencode/skills`, universal `.agents/skills`, etc.) shipped as static data in `src/core/targets.ts`.

---

## Architecture

```
skillbase/
├── bin/skillbase.js            # shebang entry, imports dist
├── src/
│   ├── cli.ts                  # Commander program definition, global flags
│   ├── commands/               # Thin layer: parse args → call core → render
│   │   ├── find.ts  add.ts  list.ts  remove.ts  update.ts
│   │   ├── targets.ts  scan.ts  new.ts  config.ts
│   ├── core/                   # Business logic, no TTY I/O
│   │   ├── registry.ts         # skills.sh search client + types
│   │   ├── fetcher.ts          # GitHub download → temp dir
│   │   ├── vault.ts            # vault CRUD, hashing, meta read/write
│   │   ├── frontmatter.ts      # SKILL.md YAML frontmatter parser
│   │   ├── targets.ts          # preset catalog + target config CRUD
│   │   ├── sync.ts             # deploy engine: symlink/junction/copy
│   │   ├── updater.ts          # hash compare, diff prep, apply + re-sync
│   │   ├── scanner.ts          # adopt unmanaged folders in targets
│   │   └── config.ts           # load/save ~/.skillbase/config.json
│   ├── ui/                     # clack wrappers, tables, diff rendering
│   └── types.ts
└── test/
```

Rules of thumb: `core/*` modules are pure logic testable without a TTY; `commands/*` contain no business rules; `ui/*` owns all terminal presentation.

Build: `tsup` (ESM + bundled deps for fast installs), `bin` field maps `skillbase` → `bin/skillbase.js`.

## On-Disk Layout

| Content | Default location |
|---|---|
| Config | `~/.skillbase/config.json` |
| Vault | `~/.skillbase/vault/<slug>/` (relocatable via config) |
| Skill files | `<vault>/<slug>/SKILL.md` plus supporting files verbatim |
| Per-skill metadata | `<vault>/<slug>/skillbase.meta.json` |

```jsonc
// skillbase.meta.json
{
  "slug": "tdd",
  "name": "TDD",
  "description": "...",
  "source": { "type": "registry", "owner": "mattpocock", "repo": "skills", "path": "skills/tdd", "skillId": "tdd" },
  "contentHash": "sha256-...",
  "syncMethod": "symlink",           // symlink | junction | copy (resolved at deploy time)
  "deployments": [                    // maintained by sync/updater
    { "targetId": "agents-global", "linkPath": "~/.agents/skills/tdd", "method": "symlink" }
  ],
  "installedAt": "2026-08-23T...",
  "updatedAt": "2026-08-23T..."
}

// ~/.skillbase/config.json
{
  "version": 1,
  "vaultPath": "~/.skillbase/vault",
  "targets": [
    { "id": "agents-global", "name": "Universal (.agents)", "path": "~/.agents/skills",
      "type": "agents", "method": "symlink", "active": true }
  ],
  "updateCheck": { "intervalHours": 24, "lastCheck": null },
  "telemetry": false
}
```

Local/custom skills have `source.type: "local"` and no update tracking. Adopted-but-not-moved folders appear in listings as `external`.

## Core Flows

### `skillbase find [query]`
Interactive clack-style flow: type query (debounced ≥2 chars) → results list (name, source, installs) → select → preview SKILL.md → offer `add`. Non-TTY mode prints results table and exits (agent-friendly).

### `skillbase add <source>`
1. Resolve source format → locate skill folder (GitHub trees API; local path used directly).
2. Download to temp dir; validate frontmatter (`name`, `description` required).
3. Preview SKILL.md; confirm.
4. Slug collision handling: prompt overwrite / auto-rename `<slug>-<owner>`.
5. Write into vault; compute SHA-256 content hash; write meta.
6. Prompt multi-select of active targets (default: all active).
7. Sync each target: try symlink (Windows: junction); fall back to copy with an output note; record deployment in meta.

### Startup update check
On any command, if `now - lastCheck > intervalHours`: fetch upstream hashes for registry-sourced skills **in parallel with a short overall timeout (~2s)**; never block longer than that; failures are silent. If outdated skills exist, print one dim badge line above command output: `⬆ N updates available — run 'skillbase update'`. `--check` forces an immediate check.

### `skillbase update [names...] | --all`
1. List outdated (hash mismatch): fetch fresh contents per skill.
2. Show change summary: files changed count + line diff of SKILL.md; audit status if retrievable.
3. Confirm per skill (or `--all`).
4. Replace folder contents in vault → re-sync every recorded deployment → refresh hash/meta.

### `skillbase remove <name> [--purge]`
Remove deployments from chosen targets (delete link/folder). Without `--purge` the vault copy stays (marked not-deployed).

### `skillbase list [--target <id>]`
Table: slug, source, version-ish (updated date), deployments per active target, flags (`external`, `unmanaged`, `outdated`).

### `skillbase targets`
List/add/remove/activate/deactivate targets; first-run wizard offers detected presets (folders that exist). Custom target = arbitrary path, including project-local `.agent/skills`.

### `skillbase scan`
Walk active target dirs → folders containing `SKILL.md` without matching vault entry → prompt adopt (move into vault, replace with link) or mark external.

### `skillbase new [name]`
Scaffold minimal valid SKILL.md into vault (frontmatter template + sections), then optionally deploy.

### `skillbase config`
Get/set `vaultPath` (migrates vault), `updateCheck.intervalHours`, disable startup check.

## Error Handling Matrix

| Scenario | Behavior |
|---|---|
| Network failure (search/add) | Clear message + retry hint; downloads land in temp first — vault only written on success |
| Update-check failure/timeout | Silent skip; retried next invocation |
| Symlink denied by OS | Junction fallback (Windows) → copy last resort; method recorded in meta and noted in output |
| Corrupt/missing meta | Skill listed as `unmanaged`; fix = re-run `add` (idempotent overwrite) |
| Slug collision across sources | Prompt: overwrite or auto-rename `<slug>-<owner>` |
| Target path missing/unwritable | Create on install; on failure skip that target and report per-target result summary |
| Invalid frontmatter | Reject before entering vault; show offending fields |

## Testing Strategy (Vitest)

- **Unit** (temp-dir fixtures, no network): vault CRUD + hashing, frontmatter edge cases, sync engine incl. fallback ladder, targets CRUD/presets, updater hash comparison, config load/migrate.
- **Integration**: full `find → add → sync → update → remove` lifecycle with registry mocked via msw and a local fixture repo acting as the GitHub source.
- **CLI smoke**: execute built binary in CI matrix (Windows/macOS/Linux) — required because symlink semantics differ per OS.
- No test performs real network calls.

## Out of Scope (v1)

- Web UI / dashboard (explicitly dropped).
- Project-scope lockfiles shared via git (`skillbase.lock`).
- Publishing skills to the registry.
- The OIDC-gated v1 endpoints beyond best-effort audits.

## Open Questions

None — all brainstorming questions resolved.
