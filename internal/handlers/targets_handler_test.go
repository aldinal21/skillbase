package handlers

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"skillbase/internal/models"
)

func TestSeedPresetsHandler(t *testing.T) {
	handler, e, cleanup := setupTestHandler(t)
	defer cleanup()

	req := httptest.NewRequest(http.MethodPost, "/targets/seed-presets", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	err := handler.SeedPresets(c)
	if err != nil {
		t.Fatalf("SeedPresets returned error: %v", err)
	}

	if rec.Code != http.StatusOK {
		t.Errorf("expected status %d, got %d", http.StatusOK, rec.Code)
	}

	// Verify targets were seeded in repository
	targets, err := handler.targetRepo.GetAll()
	if err != nil {
		t.Fatalf("failed to fetch targets: %v", err)
	}

	if len(targets) < 4 {
		t.Errorf("expected at least 4 default preset targets, got %d", len(targets))
	}

	body := rec.Body.String()
	if !strings.Contains(body, "Universal Agents") || !strings.Contains(body, "~/.agents/skills") {
		t.Errorf("expected rendered HTML to contain 'Universal Agents' and '~/.agents/skills', got:\n%s", body)
	}
}

func TestPrepareTargetViewsExpandedPath(t *testing.T) {
	handler, _, cleanup := setupTestHandler(t)
	defer cleanup()

	targets := []models.AgentTarget{
		{
			ID:        1,
			Name:      "Universal Agents",
			Path:      "~/.agents/skills",
			AgentType: "universal",
			SyncMode:  "symlink",
			IsActive:  true,
		},
	}

	views := handler.prepareTargetViews(targets)
	if len(views) != 1 {
		t.Fatalf("expected 1 target view, got %d", len(views))
	}

	if views[0].Path != "~/.agents/skills" {
		t.Errorf("expected raw path '~/.agents/skills', got %q", views[0].Path)
	}

	if views[0].ExpandedPath == "" || strings.HasPrefix(views[0].ExpandedPath, "~") {
		t.Errorf("expected ExpandedPath to be absolute resolved path, got %q", views[0].ExpandedPath)
	}
}
