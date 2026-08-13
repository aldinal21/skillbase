# Task 1: Refactor Router, Handlers & Separate HTML Views

**Plan File:** `docs/superpowers/specs/2026-08-13-clean-navigation-spec.md`

## Requirements & Scope
- Create `web/templates/pages/overview.html`:
  - Lean overview dashboard displaying stats summary, quick action cards (Import / Create), and configured target agents list.
- Create `web/templates/pages/skills.html`:
  - Full Skills Library page with search input, source filter tabs, and skill cards grid.
- Update `internal/handlers/dashboard_handler.go`:
  - `RenderOverview(c echo.Context) error` for `/`.
  - `RenderSkillsLibrary(c echo.Context) error` for `/skills`.
- Update `web/templates/partials/sidebar.html`:
  - Proper navigation links (`href="/"`, `href="/skills"`).
- Update `main.go`:
  - Register `/` -> `RenderOverview` and `/skills` -> `RenderSkillsLibrary`.
- Ensure all tests pass with `go test ./...` and `go build main.go` succeeds.
- Commit changes.
