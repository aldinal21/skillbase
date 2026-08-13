package services

import (
	"os"
	"path/filepath"
	"testing"

	"skillbase/internal/database"
	"skillbase/internal/models"
	"skillbase/internal/repository"
)

func TestScanActiveTargetsWithExpandedPaths(t *testing.T) {
	home, err := os.UserHomeDir()
	if err != nil {
		t.Fatalf("failed to get user home dir: %v", err)
	}

	// Setup temporary directory under user's home dir to test tilde (~) expansion
	testDirName := ".test_skillbase_scanner_" + filepath.Base(t.TempDir())
	testDir := filepath.Join(home, testDirName)
	skillDir := filepath.Join(testDir, "tilde-skill")
	if err := os.MkdirAll(skillDir, 0755); err != nil {
		t.Fatalf("failed to create skill dir: %v", err)
	}
	defer os.RemoveAll(testDir)

	skillContent := `---
name: Test Tilde Skill
description: A test skill for tilde path expansion
---
# Test Tilde Skill`
	if err := os.WriteFile(filepath.Join(skillDir, "SKILL.md"), []byte(skillContent), 0644); err != nil {
		t.Fatalf("failed to write SKILL.md: %v", err)
	}

	db, err := database.InitDB(":memory:")
	if err != nil {
		t.Fatalf("failed to init db: %v", err)
	}
	defer db.Close()

	targetRepo := repository.NewTargetRepository(db)
	skillRepo := repository.NewSkillRepository(db)
	vaultService := NewVaultService(t.TempDir())

	tildePath := "~/" + testDirName

	err = targetRepo.Create(&models.AgentTarget{
		Name:      "Test Tilde Target",
		Path:      tildePath,
		AgentType: "universal",
		IsActive:  true,
	})
	if err != nil {
		t.Fatalf("failed to create target: %v", err)
	}

	scanner := NewScannerService(targetRepo, skillRepo, vaultService)
	adoptedCount, err := scanner.ScanActiveTargets()
	if err != nil {
		t.Fatalf("scanner error: %v", err)
	}

	if adoptedCount != 1 {
		t.Errorf("expected 1 adopted skill, got %d", adoptedCount)
	}

	skill, err := skillRepo.GetBySlug("tilde-skill")
	if err != nil || skill == nil {
		t.Fatalf("expected skill 'tilde-skill' in repository, got err: %v", err)
	}
	if skill.Name != "Test Tilde Skill" {
		t.Errorf("expected skill name 'Test Tilde Skill', got %q", skill.Name)
	}
}
