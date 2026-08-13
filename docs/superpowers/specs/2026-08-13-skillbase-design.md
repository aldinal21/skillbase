# SkillBase - Technical Design Specification

## Overview
**SkillBase** adalah aplikasi All-in-One Agent Skill Manager berbasis **Go (Echo Framework)**, **SQLite**, **HTMX**, **Alpine.js**, dan **Tailwind CSS**. SkillBase dirancang untuk mengelola, membuat, mengimpor dari GitHub, serta mendistribusikan (*sync/deploy*) *skills* untuk AI Agent (seperti Antigravity CLI, Claude Agent, `.agent/skills`, dsb.) melalui interface dashboard web yang ultra-responsif dan profesional.

---

## 1. System Architecture & Storage Model

```
+-------------------------------------------------------------------------------+
|                                  SkillBase                                   |
|                                                                               |
|  [ Master Storage / Vault ]                                                   |
|  ├── SQLite Database (`SkillBase.db`) -> Metadata & Registry                  |
|  └── File Storage (`storage/skills/<slug>/`) -> Master Copy `SKILL.md`        |
|                                                                               |
|  [ Sync Engine (Hybrid Symlink / Copy) ]                                      |
|  ├── Mode 1: Symlink (Default) -> Direct link to Master Vault (Auto-Sync)     |
|  └── Mode 2: Copy File (Fallback) -> Deep copy if OS/Disk restricts symlinks  |
|                                                                               |
|  [ Universal Agent Targets ]                                                  |
|  ├── Target A (Global Antigravity): `~/.gemini/antigravity-cli/skills/`       |
|  ├── Target B (Project-Local): `C:\path\to\project\.agent\skills\`             |
|  └── Target C (Custom CLI/Agent): `~/.claude/skills/`                         |
+-------------------------------------------------------------------------------+
```

---

## 2. Tech Stack Details

- **Language**: Go 1.22+
- **Web Framework**: Echo v4 (`github.com/labstack/echo/v4`)
- **Database**: SQLite (`modernc.org/sqlite` atau `github.com/mattn/go-sqlite3`)
- **Frontend Utilities**:
  - HTMX v1.9+ (Server-driven HTML partial swapping)
  - Alpine.js v3+ (Client-side interactive state management & UI micro-interactions)
  - Tailwind CSS (v3 via CDN for fast styling without npm build toolchain)
  - Marked.js (Client-side live markdown preview in editor)

---

## 3. Database Schema

### `skills`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique ID |
| `name` | TEXT | NOT NULL | Skill title |
| `slug` | TEXT | UNIQUE, NOT NULL | Folder & URL-friendly slug |
| `description` | TEXT | | Brief overview of the skill |
| `content` | TEXT | NOT NULL | Full Markdown body (`SKILL.md`) |
| `tags` | TEXT | | Comma-separated or JSON array of tags |
| `source_type` | TEXT | DEFAULT 'custom' | `'custom'`, `'github'`, `'imported'` |
| `source_url` | TEXT | | Original GitHub repo/file URL if imported |
| `created_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Creation timestamp |
| `updated_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Last update timestamp |

### `agent_targets`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique ID |
| `name` | TEXT | NOT NULL | Display name (e.g. "Antigravity CLI", "Local Workspace") |
| `path` | TEXT | NOT NULL | Absolute local directory path |
| `sync_mode` | TEXT | DEFAULT 'symlink' | `'symlink'`, `'copy'`, `'auto'` |
| `is_active` | BOOLEAN | DEFAULT 1 | Enabled state for quick sync |

### `skill_deployments`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Deployment record ID |
| `skill_id` | INTEGER | FOREIGN KEY -> `skills(id)` | Skill reference |
| `target_id` | INTEGER | FOREIGN KEY -> `agent_targets(id)` | Target agent path reference |
| `deployed_type` | TEXT | NOT NULL | `'symlink'` or `'copy'` |
| `deployed_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Deployment timestamp |

---

## 4. Key Features & Workflows

### 4.1. Universal Storage & Vault
- Setiap skill disimpan di Database SQLite dan direktori internal `storage/skills/<slug>/SKILL.md`.
- Perubahan pada master skill otomatis berdampak ke seluruh target yang di-symlink.

### 4.2. Universal Agent Sync Engine (Hybrid Symlink / Copy)
1. **Default Symlink**: Menggunakan `os.Symlink` (atau Windows Junction Point `mklink /J`) mengarah dari folder target ke master vault `storage/skills/<slug>/`.
2. **Automatic Fallback**: Jika pembuatan symlink gagal (misal: kendala Windows Permission / Developer Mode disabled), sistem otomatis beralih ke **Copy File** murni dan memberikan notifikasi status ke dashboard UI.

### 4.3. GitHub Skill Importer
1. User memasukkan URL Repository/Folder GitHub.
2. Server menggunakan API/Raw Fetcher untuk memindai daftar file `.md` / `SKILL.md`.
3. Menampilkan dynamic checklist modal untuk memilih skill yang ingin di-import.
4. Skill yang dipilih disimpan ke Vault internal & SQLite DB.

### 4.4. Dashboard & Skill Builder
- Grid view & List view dengan UI Tailwind CSS modern (Dark Slate theme).
- Instant search & Filter by tag / source / target status via HTMX.
- Fullscreen/Modal Skill Editor dengan live Markdown preview (Marked.js).

---

## 5. Directory Structure

```
SkillBase/
├── main.go
├── go.mod
├── go.sum
├── storage/
│   └── skills/           # Master Vault Copy (Internal storage)
├── internal/
│   ├── config/
│   ├── database/
│   ├── handlers/
│   │   ├── dashboard.go
│   │   ├── skill.go
│   │   ├── importer.go
│   │   └── target.go
│   ├── models/
│   ├── repository/
│   └── services/
│       ├── github.go
│       ├── parser.go
│       └── syncer.go      # Handles Symlink & Fallback Copy
├── web/
│   ├── static/
│   └── templates/
│       ├── layouts/
│       └── partials/
└── docs/
    └── superpowers/
        └── specs/
```

---

## 6. Verification & Quality Plan
- **Unit Tests**:
  - Test Sync Engine (`os.Symlink` vs `CopyFile` fallback behavior).
  - Test SQLite Repository CRUD operation.
  - Test GitHub repository tree parser.
- **Integration Tests**:
  - Test Echo Web Endpoints (`/api/skills`, `/api/import`, `/api/deploy`).
- **UI Verification**:
  - Test dynamic HTMX partial swapping and Alpine.js interactive states.
