# Task 2: SQLite Database Connection & Migrations

**Plan File:** `docs/superpowers/specs/2026-08-13-skillcraft-design.md`

## Requirements & Scope
- Create `internal/database/db.go`.
- Implement `InitDB(dbPath string) (*sql.DB, error)`.
- Use pure Go SQLite driver `modernc.org/sqlite`.
- Ensure schema migrations execute on `InitDB`:
  - `skills` table with columns: `id`, `name`, `slug`, `description`, `content`, `tags`, `source_type`, `source_url`, `created_at`, `updated_at`.
  - `agent_targets` table with columns: `id`, `name`, `path`, `sync_mode`, `is_active`.
  - `skill_deployments` table with columns: `id`, `skill_id`, `target_id`, `deployed_type`, `deployed_at`.
- Create unit test `internal/database/db_test.go` verifying database creation and schema existence.
- Ensure all tests pass with `go test ./internal/database/...`.
- Commit changes.
