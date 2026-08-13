package repository_test

import (
	"testing"

	"skillbase/internal/models"
	"skillbase/internal/repository"
)

func TestTargetRepository_CreateAndGetByID(t *testing.T) {
	db := setupTestDB(t)
	repo := repository.NewTargetRepository(db)

	target := &models.AgentTarget{
		Name:     "Antigravity CLI",
		Path:     "C:/Users/user/.gemini/antigravity-cli/skills",
		SyncMode: "symlink",
		IsActive: true,
	}

	err := repo.Create(target)
	if err != nil {
		t.Fatalf("expected no error on Create, got: %v", err)
	}

	if target.ID == 0 {
		t.Errorf("expected target.ID to be set, got 0")
	}

	fetched, err := repo.GetByID(target.ID)
	if err != nil {
		t.Fatalf("expected no error on GetByID, got: %v", err)
	}

	if fetched.Name != target.Name {
		t.Errorf("expected Name %s, got %s", target.Name, fetched.Name)
	}
	if fetched.Path != target.Path {
		t.Errorf("expected Path %s, got %s", target.Path, fetched.Path)
	}
	if fetched.SyncMode != target.SyncMode {
		t.Errorf("expected SyncMode %s, got %s", target.SyncMode, fetched.SyncMode)
	}
	if fetched.IsActive != target.IsActive {
		t.Errorf("expected IsActive %v, got %v", target.IsActive, fetched.IsActive)
	}
}

func TestTargetRepository_GetAll(t *testing.T) {
	db := setupTestDB(t)
	repo := repository.NewTargetRepository(db)

	targets := []models.AgentTarget{
		{Name: "Target A", Path: "/path/a", SyncMode: "symlink", IsActive: true},
		{Name: "Target B", Path: "/path/b", SyncMode: "copy", IsActive: false},
	}

	for i := range targets {
		if err := repo.Create(&targets[i]); err != nil {
			t.Fatalf("Create failed for target %d: %v", i, err)
		}
	}

	all, err := repo.GetAll()
	if err != nil {
		t.Fatalf("GetAll failed: %v", err)
	}
	if len(all) != 2 {
		t.Errorf("expected 2 targets, got %d", len(all))
	}
}

func TestTargetRepository_Delete(t *testing.T) {
	db := setupTestDB(t)
	repo := repository.NewTargetRepository(db)

	target := &models.AgentTarget{
		Name:     "Target To Delete",
		Path:     "/path/delete",
		SyncMode: "symlink",
		IsActive: true,
	}

	if err := repo.Create(target); err != nil {
		t.Fatalf("Create failed: %v", err)
	}

	if err := repo.Delete(target.ID); err != nil {
		t.Fatalf("Delete failed: %v", err)
	}

	_, err := repo.GetByID(target.ID)
	if err == nil {
		t.Errorf("expected error fetching deleted target, got nil")
	}

	if err := repo.Delete(99999); err == nil {
		t.Errorf("expected error deleting non-existent target ID, got nil")
	}
}

func TestSeedDefaultPresets(t *testing.T) {
	db := setupTestDB(t)
	repo := repository.NewTargetRepository(db)

	err := repo.SeedDefaultPresets()
	if err != nil {
		t.Fatalf("expected no error on SeedDefaultPresets, got: %v", err)
	}

	targets, err := repo.GetAll()
	if err != nil {
		t.Fatalf("expected no error on GetAll, got: %v", err)
	}

	if len(targets) != 4 {
		t.Fatalf("expected 4 seeded presets, got %d", len(targets))
	}

	expectedTypes := map[string]string{
		"universal":   "~/.agents/skills",
		"claude":      "~/.claude/skills",
		"antigravity": "~/.gemini/antigravity-cli/skills",
		"opencode":    "~/.opencode/skills",
	}

	for _, target := range targets {
		expectedPath, exists := expectedTypes[target.AgentType]
		if !exists {
			t.Errorf("unexpected agent_type: %s", target.AgentType)
		} else if target.Path != expectedPath {
			t.Errorf("expected path %s for agent_type %s, got %s", expectedPath, target.AgentType, target.Path)
		}
		if !target.IsActive {
			t.Errorf("expected target %s to be active", target.Name)
		}
		if target.SyncMode != "symlink" {
			t.Errorf("expected sync_mode symlink for %s, got %s", target.Name, target.SyncMode)
		}
	}

	// Test idempotency: calling SeedDefaultPresets again should not duplicate records
	err = repo.SeedDefaultPresets()
	if err != nil {
		t.Fatalf("expected no error on second SeedDefaultPresets, got: %v", err)
	}

	targetsAgain, err := repo.GetAll()
	if err != nil {
		t.Fatalf("expected no error on GetAll, got: %v", err)
	}

	if len(targetsAgain) != 4 {
		t.Fatalf("expected 4 presets after second seed, got %d", len(targetsAgain))
	}
}

