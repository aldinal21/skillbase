package services

import (
	"fmt"
	"os"
	"path/filepath"

	"skillbase/internal/models"
	"skillbase/internal/repository"
)

// ScannerService manages scanning active agent target directories and ingesting discovered skills into Master Vault and Database.
type ScannerService struct {
	targetRepo   *repository.TargetRepository
	skillRepo    *repository.SkillRepository
	vaultService *VaultService
}

// NewScannerService initializes a new ScannerService with required repositories and vault service.
func NewScannerService(
	targetRepo *repository.TargetRepository,
	skillRepo *repository.SkillRepository,
	vaultService *VaultService,
) *ScannerService {
	return &ScannerService{
		targetRepo:   targetRepo,
		skillRepo:    skillRepo,
		vaultService: vaultService,
	}
}

// ScanActiveTargets scans all active agent targets, expanding target paths (handling ~ tilde expansion),
// ingests discovered skills into the Master Vault and DB repository, and returns total count of newly adopted skills.
func (s *ScannerService) ScanActiveTargets() (int, error) {
	targets, err := s.targetRepo.GetActive()
	if err != nil {
		return 0, fmt.Errorf("failed to get active targets: %w", err)
	}

	totalAdopted := 0
	for _, target := range targets {
		expandedPath, err := ExpandPath(target.Path)
		if err != nil {
			continue
		}

		discovered, err := s.scanTargetDirectory(expandedPath)
		if err != nil {
			continue
		}

		for _, item := range discovered {
			if s.vaultService != nil {
				_ = s.vaultService.SaveSkillToVault(item.Slug, item.Content)
			}

			existing, _ := s.skillRepo.GetBySlug(item.Slug)
			if existing != nil {
				existing.Content = item.Content
				if existing.Name == "" {
					existing.Name = item.Name
				}
				_ = s.skillRepo.Update(existing)
			} else {
				newSkill := &models.Skill{
					Name:        item.Name,
					Slug:        item.Slug,
					Description: "Auto-ingested from agent target: " + target.Name,
					Content:     item.Content,
					SourceType:  "custom",
					Tags:        "ingested,local",
				}
				if err := s.skillRepo.Create(newSkill); err == nil {
					totalAdopted++
				}
			}
		}
	}

	return totalAdopted, nil
}

type discoveredSkill struct {
	Name    string
	Slug    string
	Content string
}

// scanTargetDirectory reads an expanded directory path for subdirectories containing SKILL.md or skill.md.
func (s *ScannerService) scanTargetDirectory(targetPath string) ([]discoveredSkill, error) {
	entries, err := os.ReadDir(targetPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read target directory %s: %w", targetPath, err)
	}

	var result []discoveredSkill
	for _, entry := range entries {
		entryPath := filepath.Join(targetPath, entry.Name())
		info, err := os.Stat(entryPath)
		if err != nil || !info.IsDir() {
			continue
		}

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

		result = append(result, discoveredSkill{
			Name:    name,
			Slug:    slug,
			Content: content,
		})
	}

	return result, nil
}
