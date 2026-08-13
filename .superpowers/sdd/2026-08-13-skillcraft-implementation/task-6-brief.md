# Task 6: Web UI Layout, Tailwind, HTMX & Echo Handlers

**Plan File:** `docs/superpowers/specs/2026-08-13-skillcraft-design.md`

## Requirements & Scope
- Create `web/templates/layouts/base.html` with dark slate Tailwind theme, HTMX, Alpine.js, and Marked.js integrations.
- Create partial templates in `web/templates/partials/`:
  - `skill_list.html`: Grid of skill cards with badges, slug display, and delete buttons.
  - `create_modal.html`: Modal & editor for creating/editing custom skills with live preview.
- Implement Echo HTTP Handlers in `internal/handlers/dashboard_handler.go`:
  - `RenderDashboard(c echo.Context) error`
  - `SearchSkills(c echo.Context) error`
  - `ImportSkill(c echo.Context) error`
  - `CreateSkill(c echo.Context) error`
  - `DeleteSkill(c echo.Context) error`
- Modify `main.go` to register Echo routes, HTML template renderer, database connections, and start web server on port 8080.
- Verify `go test ./...` and `go build -o skillcraft.exe main.go`.
- Commit changes.
