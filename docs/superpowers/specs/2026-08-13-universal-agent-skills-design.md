# 🎯 Universal AI Agent Skills Support & Multi-Target Architecture

**Date**: 2026-08-13  
**Status**: Approved  
**Author**: SkillBase Team  

---

## 📌 Executive Summary

SkillBase is designed as an **All-in-One Universal AI Agent Skill Manager**. It is completely decoupled from any single AI agent ecosystem, serving as a centralized hub to create, import, manage, and synchronize skills for **any AI Coding Agent** (e.g. Claude Code, OpenCode, Antigravity CLI, Cursor, Windsurf, OpenHands, custom agents). 

A key focus of SkillBase is supporting the emerging open global standard path `~/.agents/skills` alongside agent-specific global paths (`~/.claude/skills`, `~/.gemini/antigravity-cli/skills`, `~/.opencode/skills`) and project-local workspace targets (`.agent/skills`).

---

## 🏗️ Architecture & Data Model Updates

### 1. Agent Target Model & Presets (`internal/models/skill.go`)

The `AgentTarget` struct and database schema are enhanced to support agent-specific metadata, pre-seeded global presets, and cross-platform home directory expansion (`~` resolution).

```go
type AgentTarget struct {
	ID          int64  `json:"id" db:"id"`
	Name        string `json:"name" db:"name"`
	Path        string `json:"path" db:"path"`
	AgentType   string `json:"agent_type" db:"agent_type"` // e.g. "universal", "claude", "antigravity", "opencode", "custom"
	SyncMode    string `json:"sync_mode" db:"sync_mode"`   // "symlink" or "copy"
	IsActive    bool   `json:"is_active" db:"is_active"`
	Description string `json:"description" db:"description"`
}
```

#### Pre-seeded Global Presets
When initializing the database schema, SkillBase automatically seeds or offers quick-registration for standard global targets:
- **Universal Global**: `~/.agents/skills` (`AgentType: "universal"`)
- **Claude Code Global**: `~/.claude/skills` (`AgentType: "claude"`)
- **Antigravity CLI Global**: `~/.gemini/antigravity-cli/skills` (`AgentType: "antigravity"`)
- **OpenCode Global**: `~/.opencode/skills` (`AgentType: "opencode"`)
- **Local Workspace**: `.agent/skills` (`AgentType: "custom"`)

#### Path Expansion Utility (`internal/services/path_utils.go`)
Resolves paths starting with `~` dynamically using `os.UserHomeDir()` for cross-platform compatibility across Windows, macOS, and Linux:
- Windows: `~/.agents/skills` -> `C:\Users\<username>\.agents\skills`
- POSIX: `~/.agents/skills` -> `/home/<username>/.agents/skills` or `/Users/<username>/.agents/skills`

---

### 2. Skill Model & Agent Compatibility Metadata

The `Skill` model includes agent compatibility tagging to allow filtering and targeted deployments.

```go
type Skill struct {
	ID          int64     `json:"id" db:"id"`
	Name        string    `json:"name" db:"name"`
	Slug        string    `json:"slug" db:"slug"`
	Description string    `json:"description" db:"description"`
	Content     string    `json:"content" db:"content"`
	Tags        string    `json:"tags" db:"tags"`         // comma-separated tags (e.g. "git, workflow")
	TargetAgent string    `json:"target_agent" db:"target_agent"` // e.g. "all", "claude", "antigravity", "universal"
	SourceType  string    `json:"source_type" db:"source_type"`   // "custom", "github", "adopted"
	SourceURL   string    `json:"source_url" db:"source_url"`
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time `json:"updated_at" db:"updated_at"`
}
```

---

### 3. Multi-Target Scanner & Master Vault Ingestion (`internal/services/scanner_service.go`)

The Auto-Scan Service inspects active target paths (including expanded `~` directories) to detect pre-existing `SKILL.md` folders:
1. Iterates over active target directories (`~/.agents/skills`, `~/.claude/skills`, etc.).
2. Reads folder structures containing `SKILL.md`.
3. Parses YAML frontmatter (`name`, `description`) and body content.
4. Adopts unmanaged skills into Master Vault (`storage/skills/<slug>/SKILL.md`) and database repository.
5. Re-establishes deployment symlinks/copies.

---

### 4. Web UI Component Enhancements (`web/templates/`)

#### Agent Targets Page (`web/templates/pages/targets.html`)
- **Quick Preset Bar**: Buttons to add preset agent targets (`~/.agents/skills`, `~/.claude/skills`, `~/.opencode/skills`, etc.) with one click.
- **Agent Badges**: Distinct visual badges for Universal (`.agents`), Claude Code, Antigravity, OpenCode, and Custom targets.
- **Expanded Path Display**: Shows both raw path (`~/.agents/skills`) and resolved absolute path (`C:\Users\username\.agents\skills`).

#### Skills Library Page (`web/templates/pages/skills.html`)
- **Agent Filter**: Filter skills by agent compatibility (`All Agents`, `Universal`, `Claude Code`, `Antigravity`, `OpenCode`).
- **Deployment Badges**: Indicates which agent targets currently have an active deployment for each skill.

#### Dashboard Overview (`web/templates/pages/overview.html`)
- **Multi-Agent Quick Stats**: Displays active agent target counts and global sync status.
- **Scan Action**: One-click *"Scan All Global Agent Directories"* button.

---

## 🧪 Verification & Test Strategy

1. **Unit & Integration Tests**:
   - `path_utils_test.go`: Test `~` expansion on Windows and POSIX.
   - `target_repository_test.go`: Test target CRUD, preset seeding, and `agent_type` field persistence.
   - `scanner_service_test.go`: Test multi-target scanning across simulated global folders.
   - `sync_service_test.go`: Test symlink and fallback copy deployment to multiple agent targets.
2. **Go Test Suite**: Run `go test ./... -v` ensuring 100% test pass rate.

---

## 📝 Self-Review Checklist

- [x] **Placeholder Scan**: No TBD/TODO or vague requirements.
- [x] **Internal Consistency**: Target models, path resolution, database migrations, and UI templates align seamlessly.
- [x] **Scope Check**: Focused on universal agent skill management and `~/.agents/skills` target focus.
- [x] **Ambiguity Check**: Clear definition of path resolution and multi-agent presets.
