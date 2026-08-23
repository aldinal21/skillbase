# ⚡ skillbase

Vault-based AI agent skill manager. One canonical copy of every skill, linked into
Claude Code, OpenCode, Codex, Cursor, `.agents` and more.

[![CI](https://github.com/aldinal21/skillbase/actions/workflows/ci.yml/badge.svg)](https://github.com/aldinal21/skillbase/actions/workflows/ci.yml)
![Node](https://img.shields.io/badge/node-%3E%3D20-green)
![License](https://img.shields.io/badge/license-MIT-blue)

## Install

```bash
npm i -g skillbase
```

or run ad hoc:

```bash
npx skillbase
```

## Quickstart

```bash
skillbase find tdd                 # browse skills.sh
skillbase add mattpocock/skills@tdd
# choose targets on first run — done.

skillbase list                     # what's installed where
skillbase update                   # review diffs, apply
skillbase targets                  # manage deploy destinations
skillbase scan                     # adopt existing folders
skillbase new my-skill             # scaffold your own
```

## How it works

Skills live once in `~/.skillbase/vault/<slug>/` and are linked (symlink on
macOS/Linux, junction on Windows, copy fallback) into each enabled target
directory such as `~/.claude/skills` or `~/.config/opencode/skills`.

Updates are detected by comparing content hashes against upstream GitHub and are
applied only after you review the diff. A non-blocking check runs at startup
(at most every 24h) and prints a badge when updates are available.

## Commands

| Command | Description |
|---------|-------------|
| `skillbase find [query]` | Search the skills.sh registry (interactive or plain table) |
| `skillbase add <source>` | Add a skill (`owner/repo@skill`, GitHub URL, or local path); optionally deploy to targets |
| `skillbase list` | Show vault contents, sources and deployment status |
| `skillbase update [names...]` | Check for updates, review diff, apply |
| `skillbase remove <name>` | Remove deployments (`--purge` also deletes the vault copy) |
| `skillbase targets` | Manage target directories (presets for 14+ agents, custom paths) |
| `skillbase scan` | Detect and adopt existing skill folders in your targets |
| `skillbase new [name]` | Scaffold a new SKILL.md in the vault |
| `skillbase config <key> <value>` | Configure vault path, update interval, checks |

Global flags: `-v/--version`, `--check` (force immediate update check).

## Configuration

`~/.skillbase/config.json`:

```jsonc
{
  "version": 1,
  "vaultPath": "~/.skillbase/vault",   // relocatable via 'skillbase config vaultPath <path>'
  "targets": [
    { "id": "claude-code-global", "name": "Claude Code", "path": "~/.claude/skills",
      "type": "claude-code", "active": true }
  ],
  "updateCheck": { "intervalHours": 24, "lastCheck": null }
}
```

Environment: `GITHUB_TOKEN` / `GH_TOKEN` raise GitHub API rate limits and enable
private repos; `SKILLBASE_SEARCH_API` overrides the registry search endpoint.

## Development

```bash
pnpm install
pnpm test       # vitest — no network needed
pnpm build      # tsup -> dist/
node bin/skillbase.js --version
```

## License

MIT
