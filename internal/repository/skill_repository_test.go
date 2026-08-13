package repository_test

import (
	"database/sql"
	"testing"

	"skillbase/internal/database"
	"skillbase/internal/models"
	"skillbase/internal/repository"
)

func setupTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := database.InitDB(":memory:")
	if err != nil {
		t.Fatalf("failed to initialize test db: %v", err)
	}
	t.Cleanup(func() {
		db.Close()
	})
	return db
}

func TestSkillRepository_CreateAndGetByID(t *testing.T) {
	db := setupTestDB(t)
	repo := repository.NewSkillRepository(db)

	skill := &models.Skill{
		Name:        "Test Skill",
		Description: "A description of test skill",
		Content:     "# Test Skill\nContent here",
		Tags:        "test,go",
		SourceType:  "custom",
		SourceURL:   "",
	}

	err := repo.Create(skill)
	if err != nil {
		t.Fatalf("expected no error on Create, got: %v", err)
	}

	if skill.ID == 0 {
		t.Errorf("expected skill.ID to be populated, got 0")
	}
	if skill.Slug != "test-skill" {
		t.Errorf("expected auto generated slug 'test-skill', got '%s'", skill.Slug)
	}

	fetched, err := repo.GetByID(skill.ID)
	if err != nil {
		t.Fatalf("expected no error on GetByID, got: %v", err)
	}

	if fetched.Name != skill.Name {
		t.Errorf("expected Name %s, got %s", skill.Name, fetched.Name)
	}
	if fetched.Slug != skill.Slug {
		t.Errorf("expected Slug %s, got %s", skill.Slug, fetched.Slug)
	}
	if fetched.Description != skill.Description {
		t.Errorf("expected Description %s, got %s", skill.Description, fetched.Description)
	}
	if fetched.Content != skill.Content {
		t.Errorf("expected Content %s, got %s", skill.Content, fetched.Content)
	}
	if fetched.Tags != skill.Tags {
		t.Errorf("expected Tags %s, got %s", skill.Tags, fetched.Tags)
	}
}

func TestSkillRepository_GetBySlug(t *testing.T) {
	db := setupTestDB(t)
	repo := repository.NewSkillRepository(db)

	skill := &models.Skill{
		Name:    "Unique Slug Skill",
		Slug:    "custom-unique-slug",
		Content: "Some content",
	}

	if err := repo.Create(skill); err != nil {
		t.Fatalf("Create failed: %v", err)
	}

	fetched, err := repo.GetBySlug("custom-unique-slug")
	if err != nil {
		t.Fatalf("GetBySlug failed: %v", err)
	}
	if fetched.ID != skill.ID {
		t.Errorf("expected ID %d, got %d", skill.ID, fetched.ID)
	}

	_, err = repo.GetBySlug("non-existent-slug")
	if err == nil {
		t.Errorf("expected error for non-existent slug, got nil")
	}
}

func TestSkillRepository_GetAll(t *testing.T) {
	db := setupTestDB(t)
	repo := repository.NewSkillRepository(db)

	skills := []models.Skill{
		{Name: "Golang Basics", Content: "Go code", Tags: "golang,backend"},
		{Name: "Python Automation", Content: "Python script", Tags: "python,scripting"},
		{Name: "React UI", Content: "React component", Tags: "frontend,react"},
	}

	for i := range skills {
		if err := repo.Create(&skills[i]); err != nil {
			t.Fatalf("Create failed for index %d: %v", i, err)
		}
	}

	all, err := repo.GetAll("")
	if err != nil {
		t.Fatalf("GetAll failed: %v", err)
	}
	if len(all) != 3 {
		t.Errorf("expected 3 skills, got %d", len(all))
	}

	// Test search filter
	filtered, err := repo.GetAll("golang")
	if err != nil {
		t.Fatalf("GetAll search failed: %v", err)
	}
	if len(filtered) != 1 {
		t.Errorf("expected 1 skill for 'golang', got %d", len(filtered))
	} else if filtered[0].Name != "Golang Basics" {
		t.Errorf("expected 'Golang Basics', got '%s'", filtered[0].Name)
	}
}

func TestSkillRepository_Update(t *testing.T) {
	db := setupTestDB(t)
	repo := repository.NewSkillRepository(db)

	skill := &models.Skill{
		Name:    "Original Name",
		Content: "Original content",
	}
	if err := repo.Create(skill); err != nil {
		t.Fatalf("Create failed: %v", err)
	}

	skill.Name = "Updated Name"
	skill.Content = "Updated content"
	skill.GenerateSlug()

	if err := repo.Update(skill); err != nil {
		t.Fatalf("Update failed: %v", err)
	}

	fetched, err := repo.GetByID(skill.ID)
	if err != nil {
		t.Fatalf("GetByID failed: %v", err)
	}
	if fetched.Name != "Updated Name" {
		t.Errorf("expected Updated Name, got %s", fetched.Name)
	}
	if fetched.Slug != "updated-name" {
		t.Errorf("expected updated-name slug, got %s", fetched.Slug)
	}

	// Update non-existent skill ID
	dummy := &models.Skill{ID: 99999, Name: "Ghost", Content: "Ghost"}
	if err := repo.Update(dummy); err == nil {
		t.Errorf("expected error updating non-existent ID, got nil")
	}
}

func TestSkillRepository_Delete(t *testing.T) {
	db := setupTestDB(t)
	repo := repository.NewSkillRepository(db)

	skill := &models.Skill{
		Name:    "To Be Deleted",
		Content: "Content",
	}
	if err := repo.Create(skill); err != nil {
		t.Fatalf("Create failed: %v", err)
	}

	if err := repo.Delete(skill.ID); err != nil {
		t.Fatalf("Delete failed: %v", err)
	}

	_, err := repo.GetByID(skill.ID)
	if err == nil {
		t.Errorf("expected error fetching deleted skill, got nil")
	}

	// Delete non-existent
	if err := repo.Delete(99999); err == nil {
		t.Errorf("expected error deleting non-existent ID, got nil")
	}
}

func TestSkillRepository_GetAllFiltered(t *testing.T) {
	db := setupTestDB(t)
	repo := repository.NewSkillRepository(db)

	skills := []models.Skill{
		{Name: "Custom Go Skill", Content: "Go code", Tags: "golang", SourceType: "custom"},
		{Name: "GitHub Go Skill", Content: "Go github code", Tags: "golang", SourceType: "github"},
		{Name: "Custom Python Skill", Content: "Python script", Tags: "python", SourceType: "custom"},
	}

	for i := range skills {
		if err := repo.Create(&skills[i]); err != nil {
			t.Fatalf("Create failed for index %d: %v", i, err)
		}
	}

	// Test filter by sourceType custom
	customOnly, err := repo.GetAllFiltered("", "custom")
	if err != nil {
		t.Fatalf("GetAllFiltered custom failed: %v", err)
	}
	if len(customOnly) != 2 {
		t.Errorf("expected 2 custom skills, got %d", len(customOnly))
	}

	// Test filter by sourceType github
	githubOnly, err := repo.GetAllFiltered("", "github")
	if err != nil {
		t.Fatalf("GetAllFiltered github failed: %v", err)
	}
	if len(githubOnly) != 1 {
		t.Errorf("expected 1 github skill, got %d", len(githubOnly))
	}

	// Test combined search + sourceType
	combined, err := repo.GetAllFiltered("Go", "custom")
	if err != nil {
		t.Fatalf("GetAllFiltered combined failed: %v", err)
	}
	if len(combined) != 1 || combined[0].Name != "Custom Go Skill" {
		t.Errorf("expected 1 combined skill 'Custom Go Skill', got %v", combined)
	}
}
