package services

import (
	"os"
	"path/filepath"
	"testing"

	"skillcraft/internal/models"
)

func TestVaultService(t *testing.T) {
	tempVaultDir := t.TempDir()
	vault := NewVaultService(tempVaultDir)

	slug := "test-skill"
	content := "# Test Skill\nThis is a test."

	// Test GetSkillDir & GetSkillPath
	expectedDir := filepath.Join(tempVaultDir, slug)
	expectedPath := filepath.Join(expectedDir, "SKILL.md")
	if dir := vault.GetSkillDir(slug); dir != expectedDir {
		t.Errorf("expected skill dir %s, got %s", expectedDir, dir)
	}
	if path := vault.GetSkillPath(slug); path != expectedPath {
		t.Errorf("expected skill path %s, got %s", expectedPath, path)
	}

	// Test SaveSkillToVault
	if err := vault.SaveSkillToVault(slug, content); err != nil {
		t.Fatalf("failed to save skill to vault: %v", err)
	}

	savedBytes, err := os.ReadFile(expectedPath)
	if err != nil {
		t.Fatalf("failed to read saved skill file: %v", err)
	}
	if string(savedBytes) != content {
		t.Errorf("expected content %q, got %q", content, string(savedBytes))
	}

	// Test DeleteSkillFromVault
	if err := vault.DeleteSkillFromVault(slug); err != nil {
		t.Fatalf("failed to delete skill from vault: %v", err)
	}

	if _, err := os.Stat(expectedDir); !os.IsNotExist(err) {
		t.Errorf("expected skill directory to be deleted, but it still exists")
	}
}

func TestSyncService_DeploySkill_CopyMode(t *testing.T) {
	vaultDir := t.TempDir()
	targetDir := t.TempDir()

	vault := NewVaultService(vaultDir)
	syncer := NewSyncService(vault)

	skill := &models.Skill{
		Name:    "Copy Skill Test",
		Slug:    "copy-skill-test",
		Content: "# Copy Skill Content\nTesting copy deployment mode.",
	}

	if err := vault.SaveSkillToVault(skill.Slug, skill.Content); err != nil {
		t.Fatalf("failed to prepare vault skill: %v", err)
	}

	target := &models.AgentTarget{
		Name:     "Test Copy Target",
		Path:     targetDir,
		SyncMode: "copy",
		IsActive: true,
	}

	deployedType, err := syncer.DeploySkill(skill, target)
	if err != nil {
		t.Fatalf("DeploySkill failed: %v", err)
	}
	if deployedType != "copy" {
		t.Errorf("expected deployedType 'copy', got %q", deployedType)
	}

	deployedFilePath := filepath.Join(targetDir, skill.Slug, "SKILL.md")
	deployedContent, err := os.ReadFile(deployedFilePath)
	if err != nil {
		t.Fatalf("failed to read deployed skill file: %v", err)
	}
	if string(deployedContent) != skill.Content {
		t.Errorf("expected content %q, got %q", skill.Content, string(deployedContent))
	}
}

func TestSyncService_DeploySkill_SymlinkOrFallback(t *testing.T) {
	vaultDir := t.TempDir()
	targetDir := t.TempDir()

	vault := NewVaultService(vaultDir)
	syncer := NewSyncService(vault)

	skill := &models.Skill{
		Name:    "Symlink Skill Test",
		Slug:    "symlink-skill-test",
		Content: "# Symlink Skill Content\nTesting symlink deployment.",
	}

	if err := vault.SaveSkillToVault(skill.Slug, skill.Content); err != nil {
		t.Fatalf("failed to prepare vault skill: %v", err)
	}

	target := &models.AgentTarget{
		Name:     "Test Symlink Target",
		Path:     targetDir,
		SyncMode: "symlink",
		IsActive: true,
	}

	deployedType, err := syncer.DeploySkill(skill, target)
	if err != nil {
		t.Fatalf("DeploySkill failed: %v", err)
	}
	if deployedType != "symlink" && deployedType != "copy" {
		t.Errorf("expected deployedType 'symlink' or 'copy', got %q", deployedType)
	}

	deployedFilePath := filepath.Join(targetDir, skill.Slug, "SKILL.md")
	deployedContent, err := os.ReadFile(deployedFilePath)
	if err != nil {
		t.Fatalf("failed to read deployed skill file: %v", err)
	}
	if string(deployedContent) != skill.Content {
		t.Errorf("expected content %q, got %q", skill.Content, string(deployedContent))
	}
}

func TestSyncService_DeploySkill_AutoSaveVault(t *testing.T) {
	vaultDir := t.TempDir()
	targetDir := t.TempDir()

	vault := NewVaultService(vaultDir)
	syncer := NewSyncService(vault)

	skill := &models.Skill{
		Name:    "Auto Save Skill",
		Content: "# Auto Save Content",
	}

	target := &models.AgentTarget{
		Name:     "Target Auto Save",
		Path:     targetDir,
		SyncMode: "copy",
		IsActive: true,
	}

	deployedType, err := syncer.DeploySkill(skill, target)
	if err != nil {
		t.Fatalf("DeploySkill failed: %v", err)
	}
	if deployedType != "copy" {
		t.Errorf("expected deployedType 'copy', got %q", deployedType)
	}
	if skill.Slug != "auto-save-skill" {
		t.Errorf("expected slug 'auto-save-skill', got %q", skill.Slug)
	}

	// Verify vault file was auto-created
	vaultFilePath := vault.GetSkillPath(skill.Slug)
	if _, err := os.Stat(vaultFilePath); os.IsNotExist(err) {
		t.Errorf("expected vault file %s to be auto-created", vaultFilePath)
	}
}

func TestSyncService_DeploySkill_NilAndErrors(t *testing.T) {
	vault := NewVaultService(t.TempDir())
	syncer := NewSyncService(vault)

	skill := &models.Skill{Slug: "test"}
	target := &models.AgentTarget{Path: t.TempDir()}

	if _, err := syncer.DeploySkill(nil, target); err == nil {
		t.Errorf("expected error for nil skill")
	}
	if _, err := syncer.DeploySkill(skill, nil); err == nil {
		t.Errorf("expected error for nil target")
	}

	// Skill with empty content and missing vault folder
	missingSkill := &models.Skill{Slug: "nonexistent"}
	if _, err := syncer.DeploySkill(missingSkill, target); err == nil {
		t.Errorf("expected error when vault directory does not exist and content is empty")
	}
}
