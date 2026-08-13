package models

import (
	"regexp"
	"strings"
	"time"
)

// Skill represents an AI Agent Skill stored in database and master vault.
type Skill struct {
	ID          int64     `json:"id" db:"id"`
	Name        string    `json:"name" db:"name"`
	Slug        string    `json:"slug" db:"slug"`
	Description string    `json:"description" db:"description"`
	Content     string    `json:"content" db:"content"`
	Tags        string    `json:"tags" db:"tags"`
	SourceType  string    `json:"source_type" db:"source_type"`
	SourceURL   string    `json:"source_url" db:"source_url"`
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time `json:"updated_at" db:"updated_at"`
}

// AgentTarget represents a target destination path for skill synchronization.
type AgentTarget struct {
	ID       int64  `json:"id" db:"id"`
	Name     string `json:"name" db:"name"`
	Path     string `json:"path" db:"path"`
	SyncMode string `json:"sync_mode" db:"sync_mode"`
	IsActive bool   `json:"is_active" db:"is_active"`
}

// Deployment represents a record of a skill deployed to an agent target.
type Deployment struct {
	ID           int64     `json:"id" db:"id"`
	SkillID      int64     `json:"skill_id" db:"skill_id"`
	TargetID     int64     `json:"target_id" db:"target_id"`
	DeployedType string    `json:"deployed_type" db:"deployed_type"`
	DeployedAt   time.Time `json:"deployed_at" db:"deployed_at"`
}

var nonAlphanumericRegex = regexp.MustCompile(`[^a-z0-9]+`)

// GenerateSlug derives a URL/folder-friendly slug from the Skill's Name,
// sets the s.Slug field, and returns the generated slug string.
func (s *Skill) GenerateSlug() string {
	str := strings.ToLower(strings.TrimSpace(s.Name))
	// Replace non-alphanumeric sequences with a hyphen
	slug := nonAlphanumericRegex.ReplaceAllString(str, "-")
	// Trim hyphens from start and end
	slug = strings.Trim(slug, "-")
	s.Slug = slug
	return slug
}
