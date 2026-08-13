# Task 3: SQLite Repositories (CRUD for Skills & Agent Targets)

**Plan File:** `docs/superpowers/specs/2026-08-13-skillcraft-design.md`

## Requirements & Scope
- Create `internal/repository/skill_repository.go`:
  - Implement `SkillRepository` struct wrapping `*sql.DB`.
  - Methods: `Create(s *models.Skill) error`, `GetByID(id int64) (*models.Skill, error)`, `GetBySlug(slug string) (*models.Skill, error)`, `GetAll(search string) ([]models.Skill, error)`, `Update(s *models.Skill) error`, `Delete(id int64) error`.
- Create `internal/repository/target_repository.go`:
  - Implement `TargetRepository` struct wrapping `*sql.DB`.
  - Methods: `Create(t *models.AgentTarget) error`, `GetByID(id int64) (*models.AgentTarget, error)`, `GetAll() ([]models.AgentTarget, error)`, `Delete(id int64) error`.
- Create unit tests `internal/repository/skill_repository_test.go` and `internal/repository/target_repository_test.go`.
- Ensure all tests pass with `go test ./internal/repository/...`.
- Commit changes.
