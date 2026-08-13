package repository_test

import (
	"testing"

	"skillcraft/internal/models"
	"skillcraft/internal/repository"
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
