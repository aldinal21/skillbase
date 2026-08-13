# Universal AI Agent Skills Support & Multi-Target Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform SkillBase into a Universal AI Agent Skill Manager supporting any agent (Claude Code, OpenCode, Antigravity CLI, Cursor, etc.), featuring primary global target focus on `~/.agents/skills`, cross-platform `~` path resolution, pre-seeded agent presets, and updated Web UI.

**Architecture:** Extend `AgentTarget` model with `AgentType` and `Description`. Implement a cross-platform path resolution service (`path_utils.go`) using `os.UserHomeDir()`. Update SQLite schema & migrations to seed global targets (`~/.agents/skills`, `~/.claude/skills`, `~/.gemini/antigravity-cli/skills`, `~/.opencode/skills`). Update scanner service to scan expanded target paths, and enrich HTMX web templates with preset quick-add buttons and agent visual badges.

**Tech Stack:** Go 1.21+, Echo v4, SQLite (`modernc.org/sqlite`), HTMX, Alpine.js, Tailwind CSS.

## Global Constraints

- Go 1.21+ standard library and pure Go SQLite (`modernc.org/sqlite` — CGO-free).
- TDD required: Every task starts with a failing unit test before implementation.
- Standard path resolution: `~` resolves to `os.UserHomeDir()`.
- Windows junction and symlink support preserved.

---

### Task 1: Core Models & Cross-Platform Path Resolution Engine

**Files:**
- Create: `internal/services/path_utils.go`
- Create: `internal/services/path_utils_test.go`
- Modify: `internal/models/skill.go:23-30`

**Interfaces:**
- Consumes: `os.UserHomeDir()`
- Produces: `path_utils.ExpandPath(path string) (string, error)`, updated `models.AgentTarget` struct with `AgentType` and `Description`

- [ ] **Step 1: Write failing unit test for `ExpandPath` and `AgentTarget` fields**

Create `internal/services/path_utils_test.go`:
```go
package services

import (
	"os"
	"path/filepath"
	"testing"
)

func TestExpandPath(t *testing.T) {
	home, err := os.UserHomeDir()
	if err != nil {
		t.Fatalf("failed to get user home dir: %v", err)
	}

	tests := []struct {
		input    string
		expected string
	}{
		{"~/.agents/skills", filepath.Join(home, ".agents", "skills")},
		{"~/.claude/skills", filepath.Join(home, ".claude", "skills")},
		{"/absolute/path/skills", "/absolute/path/skills"},
		{"relative/path", "relative/path"},
	}

	for _, tt := range tests {
		got, err := ExpandPath(tt.input)
		if err != nil {
			t.Errorf("ExpandPath(%q) unexpected error: %v", tt.input, err)
		}
		if got != tt.expected {
			t.Errorf("ExpandPath(%q) = %q; want %q", tt.input, got, tt.expected)
		}
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/services -run TestExpandPath -v`
Expected: FAIL with "undefined: ExpandPath"

- [ ] **Step 3: Implement `ExpandPath` and update `AgentTarget` model**

Update `internal/models/skill.go`:
```go
// AgentTarget represents a target destination path for skill synchronization.
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

Create `internal/services/path_utils.go`:
```go
package services

import (
	"os"
	"path/filepath"
	"strings"
)

// ExpandPath resolves tilde (~) in file paths to the user's home directory.
func ExpandPath(path string) (string, error) {
	if path == "" {
		return "", nil
	}
	if strings.HasPrefix(path, "~") {
		home, err := os.UserHomeDir()
		if err != nil {
			return path, err
		}
		if path == "~" {
			return home, nil
		}
		if strings.HasPrefix(path, "~/") || strings.HasPrefix(path, "~\\") {
			return filepath.Join(home, path[2:]), nil
		}
	}
	return filepath.Clean(path), nil
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./internal/services -run TestExpandPath -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/models/skill.go internal/services/path_utils.go internal/services/path_utils_test.go
git commit -m "feat: add AgentTarget fields and cross-platform ExpandPath utility"
```

---

### Task 2: Database Schema Migration & Default Global Presets Repository

**Files:**
- Modify: `internal/database/db.go:62-69`
- Modify: `internal/repository/target_repository.go`
- Modify: `internal/repository/target_repository_test.go`

**Interfaces:**
- Consumes: `path_utils.ExpandPath`
- Produces: SQLite migration with `agent_type` and `description`, `targetRepo.SeedDefaultPresets()` method

- [ ] **Step 1: Write failing test for `SeedDefaultPresets` in `target_repository_test.go`**

Update `internal/repository/target_repository_test.go`:
```go
func TestSeedDefaultPresets(t *testing.T) {
	db, err := database.InitDB(":memory:")
	if err != nil {
		t.Fatalf("failed to init db: %v", err)
	}
	defer db.Close()

	repo := NewTargetRepository(db)
	err = repo.SeedDefaultPresets()
	if err != nil {
		t.Fatalf("failed to seed presets: %v", err)
	}

	targets, err := repo.GetAll()
	if err != nil {
		t.Fatalf("failed to get targets: %v", err)
	}

	if len(targets) < 4 {
		t.Errorf("expected at least 4 default preset targets, got %d", len(targets))
	}

	foundUniversal := false
	for _, target := range targets {
		if target.AgentType == "universal" && target.Path == "~/.agents/skills" {
			foundUniversal = true
			break
		}
	}
	if !foundUniversal {
		t.Errorf("expected universal target ~/.agents/skills in seeded presets")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/repository -run TestSeedDefaultPresets -v`
Expected: FAIL with "SeedDefaultPresets undefined" or missing column error

- [ ] **Step 3: Update SQLite DDL & repository code**

Update `internal/database/db.go` schema migration:
```go
	CREATE TABLE IF NOT EXISTS agent_targets (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		path TEXT NOT NULL,
		agent_type TEXT DEFAULT 'custom',
		sync_mode TEXT DEFAULT 'symlink',
		is_active BOOLEAN DEFAULT 1,
		description TEXT DEFAULT ''
	);
```

Update `internal/repository/target_repository.go`:
```go
func (r *TargetRepository) SeedDefaultPresets() error {
	presets := []models.AgentTarget{
		{
			Name:        "Universal Agents",
			Path:        "~/.agents/skills",
			AgentType:   "universal",
			SyncMode:    "symlink",
			IsActive:    true,
			Description: "Open Agent Skills standard global path for all agents",
		},
		{
			Name:        "Claude Code",
			Path:        "~/.claude/skills",
			AgentType:   "claude",
			SyncMode:    "symlink",
			IsActive:    true,
			Description: "Global skill folder for Anthropic Claude CLI",
		},
		{
			Name:        "Antigravity CLI",
			Path:        "~/.gemini/antigravity-cli/skills",
			AgentType:   "antigravity",
			SyncMode:    "symlink",
			IsActive:    true,
			Description: "Global skill folder for Google Antigravity CLI",
		},
		{
			Name:        "OpenCode Global",
			Path:        "~/.opencode/skills",
			AgentType:   "opencode",
			SyncMode:    "symlink",
			IsActive:    true,
			Description: "Global skill folder for OpenCode agent",
		},
	}

	for _, preset := range presets {
		var exists bool
		err := r.db.QueryRow("SELECT EXISTS(SELECT 1 FROM agent_targets WHERE path = ?)", preset.Path).Scan(&exists)
		if err != nil {
			return err
		}
		if !exists {
			_, err = r.db.Exec(
				"INSERT INTO agent_targets (name, path, agent_type, sync_mode, is_active, description) VALUES (?, ?, ?, ?, ?, ?)",
				preset.Name, preset.Path, preset.AgentType, preset.SyncMode, preset.IsActive, preset.Description,
			)
			if err != nil {
				return err
			}
		}
	}
	return nil
}
```
Update all repository SELECT/INSERT statements in `target_repository.go` to scan `agent_type` and `description`.

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./internal/repository -run TestSeedDefaultPresets -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/database/db.go internal/repository/target_repository.go internal/repository/target_repository_test.go
git commit -m "feat: migrate agent_targets schema and implement SeedDefaultPresets"
```

---

### Task 3: Multi-Target Scanner & Ingestion Service Update

**Files:**
- Modify: `internal/services/scanner_service.go`
- Modify: `internal/services/scanner_service_test.go`

**Interfaces:**
- Consumes: `path_utils.ExpandPath`, `targetRepo.GetActiveTargets`
- Produces: `scannerService.ScanActiveTargets()` handling expanded paths like `~/.agents/skills`

- [ ] **Step 1: Write failing unit test for scanner with expanded paths**

Update `internal/services/scanner_service_test.go`:
```go
func TestScanActiveTargetsWithExpandedPaths(t *testing.T) {
	// Setup temporary directory acting as expanded ~/.agents/skills
	tmpDir := t.TempDir()
	skillDir := filepath.Join(tmpDir, "test-skill")
	os.MkdirAll(skillDir, 0755)

	skillContent := `---
name: Test Universal Skill
description: A test skill for all agents
---
# Test Universal Skill`
	os.WriteFile(filepath.Join(skillDir, "SKILL.md"), []byte(skillContent), 0644)

	db, _ := database.InitDB(":memory:")
	defer db.Close()

	targetRepo := repository.NewTargetRepository(db)
	skillRepo := repository.NewSkillRepository(db)
	vaultService := NewMasterVaultService(t.TempDir())

	targetRepo.Create(&models.AgentTarget{
		Name:      "Test Universal",
		Path:      tmpDir,
		AgentType: "universal",
		IsActive:  true,
	})

	scanner := NewScannerService(targetRepo, skillRepo, vaultService)
	adoptedCount, err := scanner.ScanActiveTargets()
	if err != nil {
		t.Fatalf("scanner error: %v", err)
	}

	if adoptedCount != 1 {
		t.Errorf("expected 1 adopted skill, got %d", adoptedCount)
	}
}
```

- [ ] **Step 2: Run test to verify it fails/passes**

Run: `go test ./internal/services -run TestScanActiveTargetsWithExpandedPaths -v`

- [ ] **Step 3: Ensure Scanner uses `ExpandPath` for target directories**

Update `internal/services/scanner_service.go`:
In `ScanActiveTargets()`, wrap `target.Path` with `ExpandPath(target.Path)` before calling `os.ReadDir` or checking file existence.

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./internal/services -run TestScanActiveTargetsWithExpandedPaths -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/services/scanner_service.go internal/services/scanner_service_test.go
git commit -m "feat: update ScannerService to expand tilde paths in target scanning"
```

---

### Task 4: Web UI & Preset Quick-Add Handlers

**Files:**
- Modify: `internal/handlers/targets_handler.go`
- Modify: `web/templates/pages/targets.html`
- Modify: `web/templates/pages/skills.html`
- Modify: `web/templates/pages/overview.html`

**Interfaces:**
- Consumes: `targetRepo.SeedDefaultPresets()`, `path_utils.ExpandPath`
- Produces: HTML UI with Preset buttons (`Universal ~/.agents/skills`, `Claude Code`, etc.), Agent Badges, and filter options.

- [ ] **Step 1: Add Preset Handler endpoint and view helpers**

Update `internal/handlers/targets_handler.go` to add a route `POST /targets/seed-presets` calling `targetRepo.SeedDefaultPresets()` and returning refreshed targets HTML snippet for HTMX. Also attach `ExpandedPath` string to view objects when rendering target cards.

- [ ] **Step 2: Update HTMX Target Page template `web/templates/pages/targets.html`**

Add preset bar at top of Targets Manager:
```html
<div class="mb-6 bg-slate-800/60 border border-slate-700/60 rounded-xl p-4">
  <div class="flex items-center justify-between mb-3">
    <h3 class="text-sm font-semibold text-slate-200">Global Agent Presets</h3>
    <button hx-post="/targets/seed-presets" hx-target="#targets-list" class="text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg transition-colors">
      ⚡ Load All Standard Presets
    </button>
  </div>
  <div class="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
    <div class="p-2.5 bg-slate-900/60 rounded-lg border border-slate-700/40">
      <span class="font-semibold text-indigo-400">🌐 Universal</span>
      <p class="text-slate-400 truncate mt-0.5">~/.agents/skills</p>
    </div>
    <div class="p-2.5 bg-slate-900/60 rounded-lg border border-slate-700/40">
      <span class="font-semibold text-amber-400">🤖 Claude Code</span>
      <p class="text-slate-400 truncate mt-0.5">~/.claude/skills</p>
    </div>
    <div class="p-2.5 bg-slate-900/60 rounded-lg border border-slate-700/40">
      <span class="font-semibold text-emerald-400">⚡ Antigravity</span>
      <p class="text-slate-400 truncate mt-0.5">~/.gemini/.../skills</p>
    </div>
    <div class="p-2.5 bg-slate-900/60 rounded-lg border border-slate-700/40">
      <span class="font-semibold text-cyan-400">💻 OpenCode</span>
      <p class="text-slate-400 truncate mt-0.5">~/.opencode/skills</p>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Update `main.go` to call `repo.SeedDefaultPresets()` on startup**

In `main.go`, invoke `targetRepo.SeedDefaultPresets()` right after database initialization so that default global targets (`~/.agents/skills`, etc.) are pre-loaded out-of-the-box.

- [ ] **Step 4: Commit**

```bash
git add internal/handlers/ web/templates/ main.go
git commit -m "feat: add global agent preset bar, startup auto-seeding, and UI badges"
```

---

### Task 5: End-to-End Verification & Test Suite Execution

**Files:**
- Test all files in codebase

- [ ] **Step 1: Run full Go test suite**

Run: `go test ./... -v`
Expected: 100% test pass rate across database, repository, services, handlers, models.

- [ ] **Step 2: Build executable and run smoke test**

Run: `go build -o skillbase.exe main.go`
Expected: Successful compilation without errors or warnings.

- [ ] **Step 3: Commit final build confirmation**

```bash
git add .
git commit -m "chore: verify build and pass 100% test coverage for universal agent skill support"
```
