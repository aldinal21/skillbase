# SkillCraft - Technical Design Specification

## Overview
**SkillCraft** adalah aplikasi All-in-One Agent Skill Manager berbasis **Go (Echo Framework)**, **SQLite**, **HTMX**, **Alpine.js**, dan **Tailwind CSS**. SkillCraft dirancang untuk mengelola, membuat, mengimpor dari GitHub, serta mendistribusikan (sync/deploy) *skills* untuk AI Agent (seperti Antigravity CLI, Claude Agent, `.agent/skills`, dsb.) melalui interface dashboard web yang ultra-responsif dan profesional.

---

## 1. System Architecture

```
+-----------------------------------------------------------------------+
|                               SkillCraft                              |
|                                                                       |
|  [ Browser / UI Layer ]                                               |
|  Tailwind CSS (CDN) + HTMX + Alpine.js                               |
|          ^                                                            |
|          | Dynamic HTMX Partials & JSON APIs                          |
|          v                                                            |
|  [ Go Backend Engine - Echo v4 Framework ]                             |
|    ├── Handlers (Dashboard, Skill CRUD, Importer, Exporter, Settings) |
|    ├── Services                                                       |
|    │     ├── GitHub Importer (Fetch tree & markdown content)          |
|    │     ├── Skill Formatter / Parser (Frontmatter parsing)          |
|    │     └── Agent Sync Engine (Local filesystem deployment)          |
|    └── DB Layer (Repository pattern with SQLite)                      |
|          ^                                                            |
|          v                                                            |
|  [ SQLite Database ] (`skillcraft.db`)                                |
+-----------------------------------------------------------------------+
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
| `slug` | TEXT | UNIQUE, NOT NULL | URL-friendly slug |
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
| `is_active` | BOOLEAN | DEFAULT 1 | Enabled state for quick sync |

### `skill_deployments`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Deployment record ID |
| `skill_id` | INTEGER | FOREIGN KEY -> `skills(id)` | Skill reference |
| `target_id` | INTEGER | FOREIGN KEY -> `agent_targets(id)` | Target agent path reference |
| `deployed_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Deployment timestamp |

---

## 4. Key Features & Workflows

### 4.1. Dashboard & Skill Management
- Grid view & List view of stored skills with status badges (`custom`, `github`).
- Search bar with instant filtering by title, tag, or description via HTMX.
- Direct quick-copy / preview drawer for any skill.

### 4.2. GitHub Skill Importer
1. User inputs a GitHub Repository URL (e.g., `https://github.com/user/agent-skills`).
2. Server uses GitHub REST API / Raw content fetcher to list repository files and find `.md` or `SKILL.md` candidates.
3. Server returns an HTMX dynamic file selection list.
4. User selects files to import -> Server saves selected files to SQLite database.

### 4.3. Visual Skill Builder & Editor
- Modal/Drawer with Alpine.js live state.
- Form inputs for: Name, Description, Tags, Target Agents.
- Full Markdown editor with live HTML preview via Marked.js.

### 4.4. Multi-Target Deployment (Agent Sync)
- Ability to select one or multiple skills and deploy them directly to target agent directories on disk (e.g., `~/.gemini/antigravity-cli/skills/<skill-name>/SKILL.md` or `.agent/skills/<skill-name>/SKILL.md`).
- Overwrite protection & deployment log history.

---

## 5. Directory Structure

```
skillcraft/
├── main.go
├── go.mod
├── go.sum
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
│       └── syncer.go
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
- Unit tests for SQLite Repository CRUD.
- Integration tests for Echo API endpoints & GitHub importer service.
- UI validation for HTMX partial swapping and Alpine.js drawer interactions.
