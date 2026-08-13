# Task 1: Create Sidebar Partial & Update Base Template Layout

**Plan File:** `docs/superpowers/specs/2026-08-13-responsive-sidebar-design.md`

## Requirements & Scope
- Create `web/templates/partials/sidebar.html` containing:
  - Mobile slide-over drawer backdrop & transition logic (`mobileSidebarOpen`).
  - Collapsible desktop sidebar (`desktopSidebarCollapsed`).
  - Navigation buttons for All Skills, Custom Skills (`hx-get="/skills/search?source=custom"`), and GitHub Skills (`hx-get="/skills/search?source=github"`).
- Update `web/templates/layouts/base.html`:
  - Add Hamburger toggle button in Top Header for mobile view.
  - Wrap content container with responsive left padding (`md:pl-64`, `md:pl-20`).
  - Include `{{template "sidebar.html" .}}`.
- Update `internal/repository/skill_repository.go`:
  - Add `GetAllFiltered(search, sourceType string) ([]models.Skill, error)`.
- Update `internal/handlers/dashboard_handler.go`:
  - Update `SearchSkills` to handle `source` query param.
- Ensure all tests pass with `go test ./...`.
- Commit changes.
