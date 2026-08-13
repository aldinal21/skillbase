# Task 4: Local Master Vault Service & Hybrid Sync Engine

**Plan File:** `docs/superpowers/specs/2026-08-13-skillcraft-design.md`

## Requirements & Scope
- Create `internal/services/vault_service.go`:
  - Implement `VaultService` struct managing local storage vault at `storage/skills/<slug>/SKILL.md`.
  - Methods: `GetSkillPath(slug string) string`, `GetSkillDir(slug string) string`, `SaveSkillToVault(slug, content string) error`, `DeleteSkillFromVault(slug string) error`.
- Create `internal/services/sync_service.go`:
  - Implement `SyncService` struct managing deployment of skills to agent targets.
  - Implement Hybrid Sync Logic:
    1. Try `os.Symlink` (or Windows Junction/Symlink).
    2. Fallback automatically to recursive `copyDir` if symlink fails or mode is set to `'copy'`.
  - Methods: `DeploySkill(skill *models.Skill, target *models.AgentTarget) (deployedType string, err error)`.
- Create unit test `internal/services/sync_service_test.go` verifying vault storage and copy fallback mechanism.
- Ensure all tests pass with `go test ./internal/services/...`.
- Commit changes.
