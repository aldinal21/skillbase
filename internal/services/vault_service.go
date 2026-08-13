package services

import (
	"os"
	"path/filepath"
)

// VaultService manages the local master vault storage for skills.
type VaultService struct {
	baseDir string
}

// NewVaultService creates a new VaultService instance.
// If baseDir is empty, it defaults to "storage/skills".
func NewVaultService(baseDir string) *VaultService {
	if baseDir == "" {
		baseDir = "storage/skills"
	}
	return &VaultService{
		baseDir: baseDir,
	}
}

// GetSkillDir returns the directory path for a skill given its slug.
func (v *VaultService) GetSkillDir(slug string) string {
	return filepath.Join(v.baseDir, slug)
}

// GetSkillPath returns the file path to SKILL.md for a skill given its slug.
func (v *VaultService) GetSkillPath(slug string) string {
	return filepath.Join(v.GetSkillDir(slug), "SKILL.md")
}

// SaveSkillToVault saves skill markdown content to storage/skills/<slug>/SKILL.md.
func (v *VaultService) SaveSkillToVault(slug, content string) error {
	dirPath := v.GetSkillDir(slug)
	if err := os.MkdirAll(dirPath, 0755); err != nil {
		return err
	}
	filePath := v.GetSkillPath(slug)
	return os.WriteFile(filePath, []byte(content), 0644)
}

// DeleteSkillFromVault removes storage/skills/<slug>/ directory and all its contents.
func (v *VaultService) DeleteSkillFromVault(slug string) error {
	dirPath := v.GetSkillDir(slug)
	return os.RemoveAll(dirPath)
}
