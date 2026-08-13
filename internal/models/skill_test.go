package models

import (
	"testing"
)

func TestGenerateSlug(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "Standard title",
			input:    "My Super Skill",
			expected: "my-super-skill",
		},
		{
			name:     "Title with punctuation and special chars",
			input:    "  Go & SQLite Skill 2.0!! ",
			expected: "go-sqlite-skill-2-0",
		},
		{
			name:     "Multiple spaces and dashes",
			input:    "  Awesome --- Skill  Name  ",
			expected: "awesome-skill-name",
		},
		{
			name:     "Empty string",
			input:    "",
			expected: "",
		},
		{
			name:     "Already sluggified",
			input:    "already-sluggified-skill",
			expected: "already-sluggified-skill",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := &Skill{Name: tt.input}
			slug := s.GenerateSlug()
			if slug != tt.expected {
				t.Errorf("GenerateSlug() return = %q, want %q", slug, tt.expected)
			}
			if s.Slug != tt.expected {
				t.Errorf("Skill.Slug field = %q, want %q", s.Slug, tt.expected)
			}
		})
	}
}

func TestStructFields(t *testing.T) {
	skill := Skill{
		ID:          1,
		Name:        "Test Skill",
		Slug:        "test-skill",
		Description: "A test description",
		Content:     "# Test Content",
		Tags:        "test,go",
		SourceType:  "custom",
		SourceURL:   "",
	}
	if skill.ID != 1 || skill.Name != "Test Skill" || skill.Slug != "test-skill" {
		t.Errorf("Skill struct fields unexpected value: %+v", skill)
	}

	target := AgentTarget{
		ID:       10,
		Name:     "Antigravity CLI",
		Path:     "/home/user/.gemini/antigravity-cli/skills",
		SyncMode: "symlink",
		IsActive: true,
	}
	if target.ID != 10 || !target.IsActive || target.SyncMode != "symlink" {
		t.Errorf("AgentTarget struct fields unexpected value: %+v", target)
	}

	dep := Deployment{
		ID:           100,
		SkillID:      1,
		TargetID:     10,
		DeployedType: "symlink",
	}
	if dep.ID != 100 || dep.SkillID != 1 || dep.TargetID != 10 {
		t.Errorf("Deployment struct fields unexpected value: %+v", dep)
	}
}
