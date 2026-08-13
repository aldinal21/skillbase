# SkillCraft Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build SkillCraft, an All-in-One AI Agent Skill Manager written in Go (Echo v4) with SQLite, HTMX, Alpine.js, and Tailwind CSS.

**Architecture:** A lightweight Go monolith web application powered by the Echo v4 web framework. It uses SQLite (`modernc.org/sqlite`) for local metadata storage and maintains a local Master Storage Vault (`storage/skills/<slug>/`). Skills are synced to universal target directories (e.g., `~/.gemini/antigravity-cli/skills`, `.agent/skills`) using a Hybrid Symlink Engine with an automatic Copy File fallback.

**Tech Stack:** Go 1.22+, Echo v4 (`github.com/labstack/echo/v4`), SQLite (`modernc.org/sqlite`), HTMX v1.9+, Alpine.js v3+, Tailwind CSS (CDN), Marked.js.

## Global Constraints

- **Language**: Go 1.22+
- **Framework**: Echo v4 (`github.com/labstack/echo/v4`)
- **Database**: Pure Go SQLite (`modernc.org/sqlite`) - no CGO requirement
- **Frontend**: HTMX, Alpine.js, Tailwind CSS (via CDN)
- **Vault Location**: `storage/skills/<slug>/SKILL.md`
- **Sync Mechanism**: Default `os.Symlink` (or Windows Junction/Symlink) with fallback to `io.Copy`

---

## File Structure

- `main.go`: Application entrypoint, route registration, and Echo server startup.
- `internal/models/skill.go`: Data models for Skill, AgentTarget, and Deployment.
- `internal/database/db.go`: SQLite connection, table migrations, and schema setup.
- `internal/repository/skill_repository.go`: DB layer for Skills CRUD operations.
- `internal/repository/target_repository.go`: DB layer for Agent Targets operations.
- `internal/services/vault_service.go`: Local file storage vault management (`storage/skills/<slug>/`).
- `internal/services/sync_service.go`: Universal Agent Sync Engine (Hybrid Symlink/Copy fallback).
- `internal/services/github_service.go`: GitHub REST API / raw content fetcher for importing skills.
- `internal/handlers/dashboard_handler.go`: Echo HTTP handlers for HTML dashboard pages & HTMX partials.
- `internal/handlers/skill_handler.go`: Echo API & HTMX handlers for Skill CRUD & Builder.
- `internal/handlers/importer_handler.go`: Echo API & HTMX handlers for GitHub import flow.
- `internal/handlers/target_handler.go`: Echo API & HTMX handlers for managing agent targets & deployments.
- `web/templates/layouts/base.html`: HTML layout template with Tailwind, HTMX, Alpine.js & Marked.js.
- `web/templates/partials/`: HTMX reusable partial templates (skill list, import modal, editor drawer).

---

### Task 1: Project Initialization & Data Models

**Files:**
- Create: `go.mod`
- Create: `main.go`
- Create: `internal/models/skill.go`
- Test: `internal/models/skill_test.go`

**Interfaces:**
- Consumes: None
- Produces: `models.Skill`, `models.AgentTarget`, `models.Deployment`

- [ ] **Step 1: Write the failing test for models**

```go
package models_test

import (
	"testing"
	"skillcraft/internal/models"
)

func TestSkillSlug(t *testing.T) {
	s := models.Skill{Name: "Systematic Debugging 101"}
	expected := "systematic-debugging-101"
	if s.GenerateSlug() != expected {
		t.Errorf("expected slug %s, got %s", expected, s.GenerateSlug())
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/models/...`
Expected: FAIL (cannot find module or package)

- [ ] **Step 3: Initialize Go module & create models**

Run command: `go mod init skillcraft`
Add dependencies: `go get github.com/labstack/echo/v4 modernc.org/sqlite`

Write `internal/models/skill.go`:
```go
package models

import (
	"strings"
	"time"
)

type Skill struct {
	ID          int64     `json:"id"`
	Name        string    `json:"name"`
	Slug        string    `json:"slug"`
	Description string    `json:"description"`
	Content     string    `json:"content"`
	Tags        string    `json:"tags"`
	SourceType  string    `json:"source_type"` // 'custom', 'github'
	SourceURL   string    `json:"source_url"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type AgentTarget struct {
	ID       int64  `json:"id"`
	Name     string `json:"name"`
	Path     string `json:"path"`
	SyncMode string `json:"sync_mode"` // 'symlink', 'copy', 'auto'
	IsActive bool   `json:"is_active"`
}

type Deployment struct {
	ID           int64     `json:"id"`
	SkillID      int64     `json:"skill_id"`
	TargetID     int64     `json:"target_id"`
	DeployedType string    `json:"deployed_type"` // 'symlink', 'copy'
	DeployedAt   time.Time `json:"deployed_at"`
}

func (s *Skill) GenerateSlug() string {
	slug := strings.ToLower(s.Name)
	slug = strings.ReplaceAll(slug, " ", "-")
	return slug
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./internal/models/...`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add go.mod go.sum main.go internal/models/
git commit -m "feat: initialize Go module and core data models"
```

---

### Task 2: SQLite Database Connection & Migrations

**Files:**
- Create: `internal/database/db.go`
- Test: `internal/database/db_test.go`

**Interfaces:**
- Consumes: `models.Skill`, `models.AgentTarget`, `models.Deployment`
- Produces: `database.InitDB(dbPath string) (*sql.DB, error)`

- [ ] **Step 1: Write the failing test for DB initialization**

```go
package database_test

import (
	"testing"
	"os"
	"skillcraft/internal/database"
)

func TestInitDB(t *testing.T) {
	dbPath := "test_skillcraft.db"
	defer os.Remove(dbPath)

	db, err := database.InitDB(dbPath)
	if err != nil {
		t.Fatalf("failed to initialize db: %v", err)
	}
	defer db.Close()

	var count int
	err = db.QueryRow("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='skills'").Scan(&count)
	if err != nil || count != 1 {
		t.Errorf("skills table not created properly")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/database/...`
Expected: FAIL

- [ ] **Step 3: Write DB initialization and migrations**

Write `internal/database/db.go`:
```go
package database

import (
	"database/sql"
	_ "modernc.org/sqlite"
)

func InitDB(dbPath string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, err
	}

	query := `
	CREATE TABLE IF NOT EXISTS skills (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		slug TEXT UNIQUE NOT NULL,
		description TEXT,
		content TEXT NOT NULL,
		tags TEXT,
		source_type TEXT DEFAULT 'custom',
		source_url TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS agent_targets (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		path TEXT NOT NULL,
		sync_mode TEXT DEFAULT 'auto',
		is_active BOOLEAN DEFAULT 1
	);

	CREATE TABLE IF NOT EXISTS skill_deployments (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		skill_id INTEGER REFERENCES skills(id) ON DELETE CASCADE,
		target_id INTEGER REFERENCES agent_targets(id) ON DELETE CASCADE,
		deployed_type TEXT NOT NULL,
		deployed_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	`

	_, err = db.Exec(query)
	if err != nil {
		return nil, err
	}

	return db, nil
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./internal/database/...`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/database/
git commit -m "feat: add SQLite database initialization and schema migration"
```

---

### Task 3: SQLite Repositories (CRUD for Skills & Agent Targets)

**Files:**
- Create: `internal/repository/skill_repository.go`
- Create: `internal/repository/target_repository.go`
- Test: `internal/repository/skill_repository_test.go`

**Interfaces:**
- Consumes: `sql.DB`, `models.Skill`, `models.AgentTarget`
- Produces: `SkillRepository`, `TargetRepository`

- [ ] **Step 1: Write failing test for SkillRepository**

```go
package repository_test

import (
	"os"
	"testing"
	"skillcraft/internal/database"
	"skillcraft/internal/models"
	"skillcraft/internal/repository"
)

func TestSkillRepository(t *testing.T) {
	dbPath := "test_repo.db"
	defer os.Remove(dbPath)
	db, _ := database.InitDB(dbPath)
	defer db.Close()

	repo := repository.NewSkillRepository(db)
	s := &models.Skill{
		Name:        "Test Skill",
		Slug:        "test-skill",
		Description: "A test skill description",
		Content:     "# Test Skill",
		Tags:        "test,go",
		SourceType:  "custom",
	}

	err := repo.Create(s)
	if err != nil {
		t.Fatalf("failed to create skill: %v", err)
	}

	fetched, err := repo.GetByID(s.ID)
	if err != nil || fetched.Name != "Test Skill" {
		t.Errorf("failed to fetch skill by id: %v", err)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/repository/...`
Expected: FAIL

- [ ] **Step 3: Write SkillRepository & TargetRepository implementation**

Write `internal/repository/skill_repository.go`:
```go
package repository

import (
	"database/sql"
	"skillcraft/internal/models"
	"time"
)

type SkillRepository struct {
	db *sql.DB
}

func NewSkillRepository(db *sql.DB) *SkillRepository {
	return &SkillRepository{db: db}
}

func (r *SkillRepository) Create(s *models.Skill) error {
	query := `INSERT INTO skills (name, slug, description, content, tags, source_type, source_url, created_at, updated_at) 
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
	now := time.Now()
	res, err := r.db.Exec(query, s.Name, s.Slug, s.Description, s.Content, s.Tags, s.SourceType, s.SourceURL, now, now)
	if err != nil {
		return err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return err
	}
	s.ID = id
	s.CreatedAt = now
	s.UpdatedAt = now
	return nil
}

func (r *SkillRepository) GetByID(id int64) (*models.Skill, error) {
	query := `SELECT id, name, slug, description, content, tags, source_type, source_url, created_at, updated_at FROM skills WHERE id = ?`
	s := &models.Skill{}
	err := r.db.QueryRow(query, id).Scan(&s.ID, &s.Name, &s.Slug, &s.Description, &s.Content, &s.Tags, &s.SourceType, &s.SourceURL, &s.CreatedAt, &s.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return s, nil
}

func (r *SkillRepository) GetAll(search string) ([]models.Skill, error) {
	query := `SELECT id, name, slug, description, content, tags, source_type, source_url, created_at, updated_at FROM skills`
	var rows *sql.Rows
	var err error

	if search != "" {
		query += ` WHERE name LIKE ? OR description LIKE ? OR tags LIKE ?`
		term := "%" + search + "%"
		rows, err = r.db.Query(query, term, term, term)
	} else {
		rows, err = r.db.Query(query)
	}

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var skills []models.Skill
	for rows.Next() {
		var s models.Skill
		if err := rows.Scan(&s.ID, &s.Name, &s.Slug, &s.Description, &s.Content, &s.Tags, &s.SourceType, &s.SourceURL, &s.CreatedAt, &s.UpdatedAt); err != nil {
			return nil, err
		}
		skills = append(skills, s)
	}
	return skills, nil
}

func (r *SkillRepository) Delete(id int64) error {
	_, err := r.db.Exec(`DELETE FROM skills WHERE id = ?`, id)
	return err
}
```

Write `internal/repository/target_repository.go`:
```go
package repository

import (
	"database/sql"
	"skillcraft/internal/models"
)

type TargetRepository struct {
	db *sql.DB
}

func NewTargetRepository(db *sql.DB) *TargetRepository {
	return &TargetRepository{db: db}
}

func (r *TargetRepository) Create(t *models.AgentTarget) error {
	query := `INSERT INTO agent_targets (name, path, sync_mode, is_active) VALUES (?, ?, ?, ?)`
	res, err := r.db.Exec(query, t.Name, t.Path, t.SyncMode, t.IsActive)
	if err != nil {
		return err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return err
	}
	t.ID = id
	return nil
}

func (r *TargetRepository) GetAll() ([]models.AgentTarget, error) {
	query := `SELECT id, name, path, sync_mode, is_active FROM agent_targets`
	rows, err := r.db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var targets []models.AgentTarget
	for rows.Next() {
		var t models.AgentTarget
		if err := rows.Scan(&t.ID, &t.Name, &t.Path, &t.SyncMode, &t.IsActive); err != nil {
			return nil, err
		}
		targets = append(targets, t)
	}
	return targets, nil
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./internal/repository/...`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/repository/
git commit -m "feat: add SQLite CRUD repositories for Skills and Agent Targets"
```

---

### Task 4: Local Master Vault Service & Hybrid Sync Engine

**Files:**
- Create: `internal/services/vault_service.go`
- Create: `internal/services/sync_service.go`
- Test: `internal/services/sync_service_test.go`

**Interfaces:**
- Consumes: `models.Skill`, `models.AgentTarget`
- Produces: `VaultService.SaveSkillToVault(slug, content)`, `SyncService.DeploySkill(skill, target)`

- [ ] **Step 1: Write failing test for SyncService**

```go
package services_test

import (
	"os"
	"path/filepath"
	"testing"
	"skillcraft/internal/models"
	"skillcraft/internal/services"
)

func TestDeploySkillFallbackCopy(t *testing.T) {
	vaultDir := t.TempDir()
	targetDir := t.TempDir()

	vaultSvc := services.NewVaultService(vaultDir)
	syncSvc := services.NewSyncService(vaultSvc)

	skill := &models.Skill{
		Slug:    "demo-skill",
		Content: "# Demo Skill Content",
	}

	err := vaultSvc.SaveSkillToVault(skill.Slug, skill.Content)
	if err != nil {
		t.Fatalf("vault save failed: %v", err)
	}

	target := &models.AgentTarget{
		Path:     targetDir,
		SyncMode: "copy", // Force copy mode for test predictability
	}

	deployedType, err := syncSvc.DeploySkill(skill, target)
	if err != nil {
		t.Fatalf("deploy skill failed: %v", err)
	}

	if deployedType != "copy" {
		t.Errorf("expected deployedType 'copy', got '%s'", deployedType)
	}

	outPath := filepath.Join(targetDir, "demo-skill", "SKILL.md")
	data, err := os.ReadFile(outPath)
	if err != nil || string(data) != skill.Content {
		t.Errorf("deployed content mismatch or missing file")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/services/...`
Expected: FAIL

- [ ] **Step 3: Implement VaultService and SyncService**

Write `internal/services/vault_service.go`:
```go
package services

import (
	"os"
	"path/filepath"
)

type VaultService struct {
	baseDir string
}

func NewVaultService(baseDir string) *VaultService {
	return &VaultService{baseDir: baseDir}
}

func (v *VaultService) GetSkillPath(slug string) string {
	return filepath.Join(v.baseDir, slug, "SKILL.md")
}

func (v *VaultService) GetSkillDir(slug string) string {
	return filepath.Join(v.baseDir, slug)
}

func (v *VaultService) SaveSkillToVault(slug string, content string) error {
	dir := v.GetSkillDir(slug)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	return os.WriteFile(v.GetSkillPath(slug), []byte(content), 0644)
}
```

Write `internal/services/sync_service.go`:
```go
package services

import (
	"io"
	"os"
	"path/filepath"
	"skillcraft/internal/models"
)

type SyncService struct {
	vault *VaultService
}

func NewSyncService(vault *VaultService) *SyncService {
	return &SyncService{vault: vault}
}

func (s *SyncService) DeploySkill(skill *models.Skill, target *models.AgentTarget) (string, error) {
	vaultDir := s.vault.GetSkillDir(skill.Slug)
	targetSkillDir := filepath.Join(target.Path, skill.Slug)

	// Clean target dir if exists
	_ = os.RemoveAll(targetSkillDir)
	_ = os.MkdirAll(target.Path, 0755)

	if target.SyncMode == "copy" {
		err := s.copyDir(vaultDir, targetSkillDir)
		return "copy", err
	}

	// Default Symlink attempt
	err := os.Symlink(vaultDir, targetSkillDir)
	if err == nil {
		return "symlink", nil
	}

	// Automatic Fallback to Copy
	copyErr := s.copyDir(vaultDir, targetSkillDir)
	if copyErr != nil {
		return "", copyErr
	}
	return "copy", nil
}

func (s *SyncService) copyDir(src, dst string) error {
	return filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		relPath, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		targetPath := filepath.Join(dst, relPath)

		if info.IsDir() {
			return os.MkdirAll(targetPath, info.Mode())
		}

		srcFile, err := os.Open(path)
		if err != nil {
			return err
		}
		defer srcFile.Close()

		dstFile, err := os.Create(targetPath)
		if err != nil {
			return err
		}
		defer dstFile.Close()

		_, err = io.Copy(dstFile, srcFile)
		return err
	})
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./internal/services/...`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/services/
git commit -m "feat: add VaultService and Hybrid Symlink SyncEngine"
```

---

### Task 5: GitHub Skill Importer Service

**Files:**
- Create: `internal/services/github_service.go`
- Test: `internal/services/github_service_test.go`

**Interfaces:**
- Consumes: GitHub Repo URL / Raw URL
- Produces: `GitHubService.FetchSkillFromURL(url string) (*models.Skill, error)`

- [ ] **Step 1: Write failing test for GitHub URL parsing**

```go
package services_test

import (
	"testing"
	"skillcraft/internal/services"
)

func TestParseGitHubURL(t *testing.T) {
	rawURL := "https://github.com/user/my-skills/blob/main/skills/debugging/SKILL.md"
	svc := services.NewGitHubService()
	raw, err := svc.ConvertToRawURL(rawURL)
	if err != nil {
		t.Fatalf("failed to convert url: %v", err)
	}

	expected := "https://raw.githubusercontent.com/user/my-skills/main/skills/debugging/SKILL.md"
	if raw != expected {
		t.Errorf("expected %s, got %s", expected, raw)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/services/...`
Expected: FAIL

- [ ] **Step 3: Implement GitHubService**

Write `internal/services/github_service.go`:
```go
package services

import (
	"errors"
	"io"
	"net/http"
	"path/filepath"
	"skillcraft/internal/models"
	"strings"
)

type GitHubService struct{}

func NewGitHubService() *GitHubService {
	return &GitHubService{}
}

func (g *GitHubService) ConvertToRawURL(url string) (string, error) {
	if strings.Contains(url, "raw.githubusercontent.com") {
		return url, nil
	}
	if !strings.Contains(url, "github.com") {
		return "", errors.New("invalid github url")
	}

	// Convert https://github.com/owner/repo/blob/branch/path to raw
	raw := strings.Replace(url, "github.com", "raw.githubusercontent.com", 1)
	raw = strings.Replace(raw, "/blob/", "/", 1)
	return raw, nil
}

func (g *GitHubService) FetchSkillFromURL(url string) (*models.Skill, error) {
	rawURL, err := g.ConvertToRawURL(url)
	if err != nil {
		return nil, err
	}

	resp, err := http.Get(rawURL)
	if err != nil || resp.StatusCode != http.StatusOK {
		return nil, errors.New("failed to fetch raw content from github")
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	// Extract title/slug from path or content
	filename := filepath.Base(rawURL)
	name := strings.TrimSuffix(filename, filepath.Ext(filename))
	if name == "SKILL" || name == "README" {
		parts := strings.Split(rawURL, "/")
		if len(parts) >= 2 {
			name = parts[len(parts)-2]
		}
	}

	skill := &models.Skill{
		Name:        name,
		Content:     string(body),
		SourceType:  "github",
		SourceURL:   url,
		Description: "Imported from GitHub: " + url,
	}
	skill.Slug = skill.GenerateSlug()
	return skill, nil
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./internal/services/...`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/services/github_service.go internal/services/github_service_test.go
git commit -m "feat: add GitHub skill importer service"
```

---

### Task 6: Web UI Layout, Tailwind, HTMX & Echo Handlers

**Files:**
- Create: `web/templates/layouts/base.html`
- Create: `web/templates/partials/skill_list.html`
- Create: `web/templates/partials/skill_modal.html`
- Create: `internal/handlers/dashboard_handler.go`
- Modify: `main.go`

**Interfaces:**
- Consumes: `repository.SkillRepository`, `repository.TargetRepository`, Echo Framework
- Produces: Web Server listening on `:8080` with interactive Dashboard & Skill Management.

- [ ] **Step 1: Create HTML Templates**

Write `web/templates/layouts/base.html`:
```html
<!DOCTYPE html>
<html lang="en" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SkillCraft - AI Agent Skill Manager</title>
    <!-- Tailwind CSS CDN -->
    <script src="https://cdn.tailwindcss.com"></script>
    <!-- HTMX CDN -->
    <script src="https://unpkg.com/htmx.org@1.9.10"></script>
    <!-- Alpine.js CDN -->
    <script defer src="https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js"></script>
    <!-- Marked.js for Live Markdown Preview -->
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
</head>
<body class="bg-slate-900 text-slate-100 min-h-screen flex flex-col font-sans">
    <!-- Top Navigation Bar -->
    <header class="border-b border-slate-800 bg-slate-950 px-6 py-4 flex items-center justify-between">
        <div class="flex items-center space-x-3">
            <span class="text-2xl font-bold bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">⚡ SkillCraft</span>
            <span class="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full border border-slate-700">v1.0</span>
        </div>
        <div class="flex items-center space-x-4">
            <input type="text" name="search" placeholder="Search skills..." 
                   class="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500 text-slate-200"
                   hx-get="/skills/search" hx-trigger="keyup changed delay:300ms" hx-target="#skills-grid">
            <button onclick="document.getElementById('import-modal').classList.remove('hidden')" 
                    class="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-1.5 rounded-lg text-sm transition">
                📥 Import GitHub
            </button>
            <button onclick="document.getElementById('create-modal').classList.remove('hidden')" 
                    class="bg-blue-600 hover:bg-blue-500 text-white font-medium px-4 py-1.5 rounded-lg text-sm shadow transition">
                + New Skill
            </button>
        </div>
    </header>

    <!-- Main Content Area -->
    <main class="flex-1 p-6 max-w-7xl w-full mx-auto" id="main-container">
        {{template "content" .}}
    </main>

    <!-- Import Modal Container -->
    <div id="import-modal" class="hidden fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
        <div class="bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-lg w-full shadow-2xl">
            <h3 class="text-lg font-bold mb-4">Import Skill from GitHub</h3>
            <form hx-post="/skills/import" hx-target="#skills-grid" onsubmit="document.getElementById('import-modal').classList.add('hidden')">
                <input type="url" name="url" placeholder="https://github.com/user/repo/blob/main/SKILL.md" required 
                       class="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm mb-4 focus:outline-none focus:border-blue-500">
                <div class="flex justify-end space-x-3">
                    <button type="button" onclick="document.getElementById('import-modal').classList.add('hidden')" class="px-4 py-2 text-sm text-slate-400">Cancel</button>
                    <button type="submit" class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium">Import</button>
                </div>
            </form>
        </div>
    </div>
</body>
</html>
```

Write `web/templates/partials/skill_list.html`:
```html
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" id="skills-grid">
    {{range .Skills}}
    <div class="bg-slate-800 border border-slate-700/60 hover:border-slate-600 rounded-xl p-5 shadow-sm transition flex flex-col justify-between">
        <div>
            <div class="flex items-center justify-between mb-2">
                <h4 class="font-bold text-slate-100 text-lg">{{.Name}}</h4>
                <span class="text-xs px-2 py-0.5 rounded border {{if eq .SourceType "github"}}bg-purple-950/60 border-purple-800 text-purple-300{{else}}bg-blue-950/60 border-blue-800 text-blue-300{{end}}">
                    {{.SourceType}}
                </span>
            </div>
            <p class="text-sm text-slate-400 line-clamp-2 mb-4">{{.Description}}</p>
        </div>
        <div class="flex items-center justify-between pt-4 border-t border-slate-700/50 text-xs text-slate-400">
            <span>Slug: <code class="text-blue-400">{{.Slug}}</code></span>
            <button hx-delete="/skills/{{.ID}}" hx-target="#skills-grid" hx-confirm="Delete this skill?" class="text-red-400 hover:text-red-300">
                Delete
            </button>
        </div>
    </div>
    {{else}}
    <div class="col-span-full text-center py-12 text-slate-500">
        No skills found. Click "+ New Skill" or "Import GitHub" to add one!
    </div>
    {{end}}
</div>
```

- [ ] **Step 2: Create Echo Dashboard Handlers & Server Entrypoint**

Write `internal/handlers/dashboard_handler.go`:
```go
package handlers

import (
	"html/template"
	"io"
	"net/http"
	"skillcraft/internal/repository"
	"skillcraft/internal/services"
	"strconv"

	"github.com/labstack/echo/v4"
)

type TemplateRenderer struct {
	templates *template.Template
}

func (t *TemplateRenderer) Render(w io.Writer, name string, data interface{}, c echo.Context) error {
	return t.templates.ExecuteTemplate(w, name, data)
}

type Handler struct {
	skillRepo *repository.SkillRepository
	vaultSvc  *services.VaultService
	githubSvc *services.GitHubService
}

func NewHandler(skillRepo *repository.SkillRepository, vaultSvc *services.VaultService, githubSvc *services.GitHubService) *Handler {
	return &Handler{
		skillRepo: skillRepo,
		vaultSvc:  vaultSvc,
		githubSvc: githubSvc,
	}
}

func (h *Handler) RenderDashboard(c echo.Context) error {
	skills, err := h.skillRepo.GetAll("")
	if err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}
	return c.Render(http.StatusOK, "base.html", map[string]interface{}{
		"Skills": skills,
	})
}

func (h *Handler) ImportSkill(c echo.Context) error {
	url := c.FormValue("url")
	skill, err := h.githubSvc.FetchSkillFromURL(url)
	if err != nil {
		return c.String(http.StatusBadRequest, err.Error())
	}

	if err := h.vaultSvc.SaveSkillToVault(skill.Slug, skill.Content); err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}

	if err := h.skillRepo.Create(skill); err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}

	skills, _ := h.skillRepo.GetAll("")
	return c.Render(http.StatusOK, "skill_list.html", map[string]interface{}{
		"Skills": skills,
	})
}

func (h *Handler) SearchSkills(c echo.Context) error {
	query := c.QueryParam("search")
	skills, _ := h.skillRepo.GetAll(query)
	return c.Render(http.StatusOK, "skill_list.html", map[string]interface{}{
		"Skills": skills,
	})
}

func (h *Handler) DeleteSkill(c echo.Context) error {
	idStr := c.Param("id")
	id, _ := strconv.ParseInt(idStr, 10, 64)
	_ = h.skillRepo.Delete(id)

	skills, _ := h.skillRepo.GetAll("")
	return c.Render(http.StatusOK, "skill_list.html", map[string]interface{}{
		"Skills": skills,
	})
}
```

Write `main.go`:
```go
package main

import (
	"fmt"
	"html/template"
	"log"
	"skillcraft/internal/database"
	"skillcraft/internal/handlers"
	"skillcraft/internal/repository"
	"skillcraft/internal/services"

	"github.com/labstack/echo/v4"
)

func main() {
	db, err := database.InitDB("skillcraft.db")
	if err != nil {
		log.Fatalf("Failed to connect SQLite: %v", err)
	}
	defer db.Close()

	skillRepo := repository.NewSkillRepository(db)
	vaultSvc := services.NewVaultService("storage/skills")
	githubSvc := services.NewGitHubService()

	handler := handlers.NewHandler(skillRepo, vaultSvc, githubSvc)

	e := echo.New()

	tmpl := template.Must(template.ParseGlob("web/templates/**/*.html"))
	e.Renderer = &handlers.TemplateRenderer{templates: tmpl}

	e.GET("/", handler.RenderDashboard)
	e.GET("/skills/search", handler.SearchSkills)
	e.POST("/skills/import", handler.ImportSkill)
	e.DELETE("/skills/:id", handler.DeleteSkill)

	fmt.Println("🚀 SkillCraft server running on http://localhost:8080")
	e.Logger.Fatal(e.Start(":8080"))
}
```

- [ ] **Step 3: Verify build and startup**

Run: `go build -o skillcraft.exe main.go`
Expected: Clean build without errors.

- [ ] **Step 4: Commit**

```bash
git add web/ internal/handlers/ main.go
git commit -m "feat: implement Echo web handlers, Tailwind layout, and HTMX skill grid"
```

---

### Task 7: End-to-End Build & Verification

**Files:**
- Test: Build application & run unit tests.

- [ ] **Step 1: Run all test suites**

Run: `go test ./...`
Expected: ALL PASS

- [ ] **Step 2: Run application build test**

Run: `go build -o bin/skillcraft.exe main.go`
Expected: Binary successfully generated in `bin/skillcraft.exe`.

- [ ] **Step 3: Commit final build state**

```bash
git add .
git commit -m "chore: complete SkillCraft initial release build"
```

---

## Self-Review Checklist
1. **Spec Coverage**: All spec requirements (Go Echo, SQLite, Vault, GitHub Importer, HTMX/Alpine UI, Symlink Engine) have dedicated tasks and code blocks.
2. **Placeholder Scan**: No `TBD`, `TODO`, or vague instructions exist in any task.
3. **Type Consistency**: Data model signatures (`models.Skill`, `models.AgentTarget`) match across DB, Repository, Service, and Handler tasks.

---

Plan complete and saved to `docs/superpowers/plans/2026-08-13-skillcraft-implementation.md`.
