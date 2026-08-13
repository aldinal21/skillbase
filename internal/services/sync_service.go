package services

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"skillcraft/internal/models"
)

// SyncService manages the deployment and synchronization of skills to agent targets.
type SyncService struct {
	vaultService *VaultService
}

// NewSyncService creates a new instance of SyncService with the provided VaultService.
func NewSyncService(vaultService *VaultService) *SyncService {
	return &SyncService{
		vaultService: vaultService,
	}
}

// DeploySkill deploys a skill to an AgentTarget using Hybrid Symlink / Copy Fallback strategy.
// Returns deployedType ("symlink" or "copy") and error if deployment fails.
func (s *SyncService) DeploySkill(skill *models.Skill, target *models.AgentTarget) (string, error) {
	if skill == nil || target == nil {
		return "", fmt.Errorf("skill and target must not be nil")
	}

	if skill.Slug == "" {
		skill.GenerateSlug()
	}
	if skill.Slug == "" {
		return "", fmt.Errorf("skill slug is empty and could not be generated")
	}

	srcDir := s.vaultService.GetSkillDir(skill.Slug)

	// Ensure vault has the skill folder and SKILL.md ready
	if _, err := os.Stat(srcDir); os.IsNotExist(err) {
		if skill.Content != "" {
			if err := s.vaultService.SaveSkillToVault(skill.Slug, skill.Content); err != nil {
				return "", fmt.Errorf("failed to save skill content to vault prior to deploy: %w", err)
			}
		} else {
			return "", fmt.Errorf("source skill vault directory does not exist: %s", srcDir)
		}
	}

	destDir := filepath.Join(target.Path, skill.Slug)

	// Remove existing target path if it exists to allow clean re-link or re-copy
	if err := os.RemoveAll(destDir); err != nil && !os.IsNotExist(err) {
		return "", fmt.Errorf("failed to remove existing target deployment path: %w", err)
	}

	// Ensure parent target directory exists
	if err := os.MkdirAll(target.Path, 0755); err != nil {
		return "", fmt.Errorf("failed to create target parent directory: %w", err)
	}

	absSrcDir, err := filepath.Abs(srcDir)
	if err != nil {
		absSrcDir = srcDir
	}

	// If explicit copy mode is requested
	if target.SyncMode == "copy" {
		if err := copyDir(absSrcDir, destDir); err != nil {
			return "", fmt.Errorf("copy deployment failed: %w", err)
		}
		return "copy", nil
	}

	// Default, symlink, or auto mode: Try symlink first
	symlinkErr := os.Symlink(absSrcDir, destDir)
	if symlinkErr == nil {
		// Verify symlink target is accessible
		if _, statErr := os.Stat(destDir); statErr == nil {
			return "symlink", nil
		}
		// If symlink target is invalid or inaccessible, cleanup and fall back to copy
		_ = os.Remove(destDir)
	}

	// Symlink failed or produced broken link -> fallback to copy logic
	if err := copyDir(absSrcDir, destDir); err != nil {
		return "", fmt.Errorf("symlink failed (%v) and fallback copy also failed: %w", symlinkErr, err)
	}

	return "copy", nil
}

// copyDir recursively copies a directory tree from src to dst.
func copyDir(src, dst string) error {
	srcInfo, err := os.Stat(src)
	if err != nil {
		return err
	}

	if err := os.MkdirAll(dst, srcInfo.Mode()); err != nil {
		return err
	}

	entries, err := os.ReadDir(src)
	if err != nil {
		return err
	}

	for _, entry := range entries {
		srcPath := filepath.Join(src, entry.Name())
		dstPath := filepath.Join(dst, entry.Name())

		if entry.IsDir() {
			if err := copyDir(srcPath, dstPath); err != nil {
				return err
			}
		} else {
			if err := copyFile(srcPath, dstPath); err != nil {
				return err
			}
		}
	}

	return nil
}

// copyFile copies a single file from src to dst.
func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()

	if _, err = io.Copy(out, in); err != nil {
		return err
	}

	info, err := os.Stat(src)
	if err == nil {
		_ = os.Chmod(dst, info.Mode())
	}

	return out.Close()
}

// IngestedSkill represents a skill discovered from scanning a target directory.
type IngestedSkill struct {
	Name    string
	Slug    string
	Content string
}

// ScanAndIngestTarget scans a target directory for existing skills (folders containing SKILL.md),
// saves them to the Master Vault, and returns the discovered skills.
func (s *SyncService) ScanAndIngestTarget(targetPath string) ([]IngestedSkill, error) {
	entries, err := os.ReadDir(targetPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read target directory: %w", err)
	}

	var discovered []IngestedSkill

	for _, entry := range entries {
		// Read both regular directories and symlinks pointing to directories
		entryPath := filepath.Join(targetPath, entry.Name())
		info, err := os.Stat(entryPath)
		if err != nil || !info.IsDir() {
			continue
		}

		// Look for SKILL.md (or skill.md)
		skillFilePath := filepath.Join(entryPath, "SKILL.md")
		data, err := os.ReadFile(skillFilePath)
		if err != nil {
			skillFilePath = filepath.Join(entryPath, "skill.md")
			data, err = os.ReadFile(skillFilePath)
			if err != nil {
				continue // Not a skill folder
			}
		}

		content := string(data)
		slug := entry.Name()
		name := extractSkillTitle(content, slug)

		// Save/adopt discovered skill into master vault
		_ = s.vaultService.SaveSkillToVault(slug, content)

		discovered = append(discovered, IngestedSkill{
			Name:    name,
			Slug:    slug,
			Content: content,
		})
	}

	return discovered, nil
}

// extractSkillTitle attempts to find H1 markdown title (# Title) or falls back to humanized slug.
func extractSkillTitle(content, fallbackSlug string) string {
	lines := strings.Split(content, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "# ") {
			title := strings.TrimPrefix(line, "# ")
			title = strings.TrimSpace(title)
			if title != "" {
				return title
			}
		}
	}

	// Humanize fallback slug (e.g. "code-reviewer" -> "Code Reviewer")
	parts := strings.Split(fallbackSlug, "-")
	for i, part := range parts {
		if len(part) > 0 {
			parts[i] = strings.ToUpper(part[:1]) + part[1:]
		}
	}
	return strings.Join(parts, " ")
}

