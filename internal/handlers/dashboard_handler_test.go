package handlers

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/labstack/echo/v4"
	"skillcraft/internal/database"
	"skillcraft/internal/repository"
	"skillcraft/internal/services"
)

type mockRoundTripper func(req *http.Request) (*http.Response, error)

func (m mockRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	return m(req)
}

func setupTestHandler(t *testing.T) (*DashboardHandler, *echo.Echo, func()) {
	t.Helper()

	db, err := database.InitDB(":memory:")
	if err != nil {
		t.Fatalf("failed to init db: %v", err)
	}

	tempDir, err := os.MkdirTemp("", "skillcraft_handler_test_*")
	if err != nil {
		db.Close()
		t.Fatalf("failed to create temp dir: %v", err)
	}

	vaultDir := filepath.Join(tempDir, "vault")
	vaultService := services.NewVaultService(vaultDir)
	skillRepo := repository.NewSkillRepository(db)
	targetRepo := repository.NewTargetRepository(db)
	syncService := services.NewSyncService(vaultService)

	mockClient := &http.Client{
		Transport: mockRoundTripper(func(req *http.Request) (*http.Response, error) {
			if strings.Contains(req.URL.String(), "raw.githubusercontent.com") {
				content := "---\nname: GitHub Imported Skill\ndescription: Skill from GitHub\ntags: github,ai\n---\n# GitHub Imported Skill\nContent here."
				return &http.Response{
					StatusCode: http.StatusOK,
					Body:       ioNopCloser(strings.NewReader(content)),
					Header:     make(http.Header),
				}, nil
			}
			return &http.Response{
				StatusCode: http.StatusNotFound,
				Body:       ioNopCloser(strings.NewReader("not found")),
				Header:     make(http.Header),
			}, nil
		}),
	}
	githubService := services.NewGitHubService(mockClient)

	handler := NewDashboardHandler(skillRepo, targetRepo, syncService, vaultService, githubService)

	// Build relative path to web templates for renderer
	templatesDir := filepath.Join("..", "..", "web")
	renderer, err := NewTemplateRendererFromDir(templatesDir)
	if err != nil {
		// Fallback: search relative cwd
		renderer, err = NewTemplateRendererFromDir("web")
		if err != nil {
			os.RemoveAll(tempDir)
			db.Close()
			t.Fatalf("failed to load template renderer: %v", err)
		}
	}

	e := echo.New()
	e.Renderer = renderer

	cleanup := func() {
		os.RemoveAll(tempDir)
		db.Close()
	}

	return handler, e, cleanup
}

type nopCloser struct {
	*strings.Reader
}

func (n nopCloser) Close() error {
	return nil
}

func ioNopCloser(r *strings.Reader) nopCloser {
	return nopCloser{Reader: r}
}

func TestRenderDashboard(t *testing.T) {
	handler, e, cleanup := setupTestHandler(t)
	defer cleanup()

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	err := handler.RenderDashboard(c)
	if err != nil {
		t.Fatalf("RenderDashboard returned error: %v", err)
	}

	if rec.Code != http.StatusOK {
		t.Errorf("expected status %d, got %d", http.StatusOK, rec.Code)
	}

	body := rec.Body.String()
	if !strings.Contains(body, "SkillCraft") || !strings.Contains(body, "Overview Dashboard") {
		t.Errorf("expected body to contain 'SkillCraft' and 'Overview Dashboard', got:\n%s", body)
	}
}

func TestRenderOverview(t *testing.T) {
	handler, e, cleanup := setupTestHandler(t)
	defer cleanup()

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	err := handler.RenderOverview(c)
	if err != nil {
		t.Fatalf("RenderOverview returned error: %v", err)
	}

	if rec.Code != http.StatusOK {
		t.Errorf("expected status %d, got %d", http.StatusOK, rec.Code)
	}

	body := rec.Body.String()
	if !strings.Contains(body, "System Overview") || !strings.Contains(body, "Quick Actions") {
		t.Errorf("expected overview body to contain 'System Overview' and 'Quick Actions', got:\n%s", body)
	}
}

func TestRenderSkillsLibrary(t *testing.T) {
	handler, e, cleanup := setupTestHandler(t)
	defer cleanup()

	req := httptest.NewRequest(http.MethodGet, "/skills", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	err := handler.RenderSkillsLibrary(c)
	if err != nil {
		t.Fatalf("RenderSkillsLibrary returned error: %v", err)
	}

	if rec.Code != http.StatusOK {
		t.Errorf("expected status %d, got %d", http.StatusOK, rec.Code)
	}

	body := rec.Body.String()
	if !strings.Contains(body, "Skills Library") {
		t.Errorf("expected skills library body to contain 'Skills Library', got:\n%s", body)
	}
}

func TestCreateSkillAndSearch(t *testing.T) {
	handler, e, cleanup := setupTestHandler(t)
	defer cleanup()

	// 1. Create custom skill via POST /skills
	form := url.Values{}
	form.Set("name", "Go Test Skill")
	form.Set("slug", "go-test-skill")
	form.Set("description", "A skill for unit testing in Go")
	form.Set("content", "# Go Test Skill\nInstructions here.")
	form.Set("tags", "go, testing")

	req := httptest.NewRequest(http.MethodPost, "/skills", strings.NewReader(form.Encode()))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationForm)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	err := handler.CreateSkill(c)
	if err != nil {
		t.Fatalf("CreateSkill returned error: %v", err)
	}

	if rec.Code != http.StatusOK {
		t.Errorf("expected status %d, got %d", http.StatusOK, rec.Code)
	}

	body := rec.Body.String()
	if !strings.Contains(body, "Go Test Skill") {
		t.Errorf("expected body to contain 'Go Test Skill', got:\n%s", body)
	}

	// 2. Search skill via GET /skills/search?q=Go
	reqSearch := httptest.NewRequest(http.MethodGet, "/skills/search?q=Go", nil)
	recSearch := httptest.NewRecorder()
	cSearch := e.NewContext(reqSearch, recSearch)

	err = handler.SearchSkills(cSearch)
	if err != nil {
		t.Fatalf("SearchSkills returned error: %v", err)
	}

	if recSearch.Code != http.StatusOK {
		t.Errorf("expected status %d, got %d", http.StatusOK, recSearch.Code)
	}

	bodySearch := recSearch.Body.String()
	if !strings.Contains(bodySearch, "Go Test Skill") {
		t.Errorf("expected search body to contain 'Go Test Skill', got:\n%s", bodySearch)
	}
}

func TestImportSkill(t *testing.T) {
	handler, e, cleanup := setupTestHandler(t)
	defer cleanup()

	form := url.Values{}
	form.Set("url", "https://github.com/example/repo/blob/main/SKILL.md")

	req := httptest.NewRequest(http.MethodPost, "/skills/import", strings.NewReader(form.Encode()))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationForm)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	err := handler.ImportSkill(c)
	if err != nil {
		t.Fatalf("ImportSkill returned error: %v", err)
	}

	if rec.Code != http.StatusOK {
		t.Errorf("expected status %d, got %d", http.StatusOK, rec.Code)
	}

	body := rec.Body.String()
	if !strings.Contains(body, "GitHub Imported Skill") {
		t.Errorf("expected body to contain 'GitHub Imported Skill', got:\n%s", body)
	}
}

func TestDeleteSkill(t *testing.T) {
	handler, e, cleanup := setupTestHandler(t)
	defer cleanup()

	// First create a skill to delete
	form := url.Values{}
	form.Set("name", "Skill To Delete")
	form.Set("content", "To be deleted.")

	reqCreate := httptest.NewRequest(http.MethodPost, "/skills", strings.NewReader(form.Encode()))
	reqCreate.Header.Set(echo.HeaderContentType, echo.MIMEApplicationForm)
	recCreate := httptest.NewRecorder()
	cCreate := e.NewContext(reqCreate, recCreate)

	if err := handler.CreateSkill(cCreate); err != nil {
		t.Fatalf("failed to create skill for delete test: %v", err)
	}

	skills, err := handler.skillRepo.GetAll("")
	if err != nil || len(skills) == 0 {
		t.Fatalf("failed to fetch created skill: %v", err)
	}
	skillID := skills[0].ID

	// Delete skill
	reqDelete := httptest.NewRequest(http.MethodDelete, "/skills/"+strconv.FormatInt(skillID, 10), nil)
	recDelete := httptest.NewRecorder()
	cDelete := e.NewContext(reqDelete, recDelete)
	cDelete.SetParamNames("id")
	cDelete.SetParamValues(strconv.FormatInt(skillID, 10))

	err = handler.DeleteSkill(cDelete)
	if err != nil {
		t.Fatalf("DeleteSkill returned error: %v", err)
	}

	if recDelete.Code != http.StatusOK {
		t.Errorf("expected status %d, got %d", http.StatusOK, recDelete.Code)
	}

	remaining, _ := handler.skillRepo.GetAll("")
	if len(remaining) != 0 {
		t.Errorf("expected 0 remaining skills, got %d", len(remaining))
	}
}

func TestSearchSkills_WithSourceFilter(t *testing.T) {
	handler, e, cleanup := setupTestHandler(t)
	defer cleanup()

	// Import GitHub skill
	formImp := url.Values{}
	formImp.Set("url", "https://github.com/example/repo/blob/main/SKILL.md")
	reqImp := httptest.NewRequest(http.MethodPost, "/skills/import", strings.NewReader(formImp.Encode()))
	reqImp.Header.Set(echo.HeaderContentType, echo.MIMEApplicationForm)
	recImp := httptest.NewRecorder()
	_ = handler.ImportSkill(e.NewContext(reqImp, recImp))

	// Create custom skill
	formCreate := url.Values{}
	formCreate.Set("name", "Custom Skill 1")
	formCreate.Set("content", "Content 1")
	reqCreate := httptest.NewRequest(http.MethodPost, "/skills", strings.NewReader(formCreate.Encode()))
	reqCreate.Header.Set(echo.HeaderContentType, echo.MIMEApplicationForm)
	recCreate := httptest.NewRecorder()
	_ = handler.CreateSkill(e.NewContext(reqCreate, recCreate))

	// Search source=custom
	reqCustom := httptest.NewRequest(http.MethodGet, "/skills/search?source=custom", nil)
	recCustom := httptest.NewRecorder()
	cCustom := e.NewContext(reqCustom, recCustom)
	if err := handler.SearchSkills(cCustom); err != nil {
		t.Fatalf("SearchSkills custom failed: %v", err)
	}
	bodyCustom := recCustom.Body.String()
	if !strings.Contains(bodyCustom, "Custom Skill 1") {
		t.Errorf("expected body to contain Custom Skill 1, got:\n%s", bodyCustom)
	}
	if strings.Contains(bodyCustom, "GitHub Imported Skill") {
		t.Errorf("expected body to NOT contain GitHub Imported Skill, got:\n%s", bodyCustom)
	}

	// Search source=github
	reqGH := httptest.NewRequest(http.MethodGet, "/skills/search?source=github", nil)
	recGH := httptest.NewRecorder()
	cGH := e.NewContext(reqGH, recGH)
	if err := handler.SearchSkills(cGH); err != nil {
		t.Fatalf("SearchSkills github failed: %v", err)
	}
	bodyGH := recGH.Body.String()
	if !strings.Contains(bodyGH, "GitHub Imported Skill") {
		t.Errorf("expected body to contain GitHub Imported Skill, got:\n%s", bodyGH)
	}
	if strings.Contains(bodyGH, "Custom Skill 1") {
		t.Errorf("expected body to NOT contain Custom Skill 1, got:\n%s", bodyGH)
	}
}
