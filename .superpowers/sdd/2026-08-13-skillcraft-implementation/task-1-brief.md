# Task 1: Project Initialization & Data Models

**Plan File:** `docs/superpowers/specs/2026-08-13-skillcraft-design.md`

## Requirements & Scope
- Create `go.mod` using `go mod init skillcraft`.
- Add dependencies: `github.com/labstack/echo/v4`, `modernc.org/sqlite`.
- Create data models in `internal/models/skill.go`:
  - `Skill` struct with fields `ID`, `Name`, `Slug`, `Description`, `Content`, `Tags`, `SourceType`, `SourceURL`, `CreatedAt`, `UpdatedAt`.
  - `GenerateSlug()` method on `Skill`.
  - `AgentTarget` struct with `ID`, `Name`, `Path`, `SyncMode`, `IsActive`.
  - `Deployment` struct with `ID`, `SkillID`, `TargetID`, `DeployedType`, `DeployedAt`.
- Create unit test `internal/models/skill_test.go` verifying `GenerateSlug()` works correctly.
- Ensure all tests pass with `go test ./internal/models/...`.
- Commit changes.
