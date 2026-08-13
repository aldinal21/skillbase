# Task 5: GitHub Skill Importer Service

**Plan File:** `docs/superpowers/specs/2026-08-13-skillcraft-design.md`

## Requirements & Scope
- Create `internal/services/github_service.go`:
  - Implement `GitHubService` struct.
  - Method `ConvertToRawURL(url string) (string, error)` converting standard GitHub web URLs (including blob URLs) to `raw.githubusercontent.com`.
  - Method `FetchSkillFromURL(url string) (*models.Skill, error)` fetching raw markdown content and extracting skill title/slug and description.
- Create unit test `internal/services/github_service_test.go` verifying URL conversion and fetching logic.
- Ensure all tests pass with `go test ./internal/services/...`.
- Commit changes.
