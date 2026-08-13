package handlers

import (
	"fmt"
	"html/template"
	"io"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/labstack/echo/v4"
	"skillbase/internal/models"
	"skillbase/internal/repository"
	"skillbase/internal/services"
)

// TemplateRenderer implements echo.Renderer interface for rendering HTML templates.
type TemplateRenderer struct {
	templates map[string]*template.Template
}

// NewTemplateRendererFromDir parses templates for each page along with base layout and partials.
func NewTemplateRendererFromDir(rootDir string) (*TemplateRenderer, error) {
	baseLayout := filepath.Join(rootDir, "templates", "layouts", "base.html")
	sidebarPartial := filepath.Join(rootDir, "templates", "partials", "sidebar.html")
	skillListPartial := filepath.Join(rootDir, "templates", "partials", "skill_list.html")
	modalPartial := filepath.Join(rootDir, "templates", "partials", "create_modal.html")

	pages := map[string]string{
		"overview.html": filepath.Join(rootDir, "templates", "pages", "overview.html"),
		"skills.html":   filepath.Join(rootDir, "templates", "pages", "skills.html"),
		"targets.html":  filepath.Join(rootDir, "templates", "pages", "targets.html"),
	}

	tmplMap := make(map[string]*template.Template)

	for name, pagePath := range pages {
		files := []string{baseLayout, pagePath, sidebarPartial, skillListPartial, modalPartial}
		t, err := template.ParseFiles(files...)
		if err != nil {
			return nil, fmt.Errorf("failed to parse template %s: %w", name, err)
		}
		tmplMap[name] = t
	}

	// Also parse partial-only renderer for HTMX partial swaps (e.g. skill_list.html)
	partialTmpl, err := template.ParseFiles(skillListPartial)
	if err == nil {
		tmplMap["skill_list.html"] = partialTmpl
	}

	return &TemplateRenderer{templates: tmplMap}, nil
}

// Render executes the named HTML template with given data.
func (t *TemplateRenderer) Render(w io.Writer, name string, data interface{}, c echo.Context) error {
	tmpl, ok := t.templates[name]
	if !ok {
		return fmt.Errorf("template %s not found", name)
	}
	// Always execute master "base.html" layout for page templates if present, or fallback to first template
	if name == "skill_list.html" {
		return tmpl.Execute(w, data)
	}
	return tmpl.ExecuteTemplate(w, "base.html", data)
}

// DashboardData holds view model state for dashboard pages and HTMX partial swaps.
type DashboardData struct {
	Skills       []models.Skill
	Targets      []TargetView
	TotalSkills  int
	SearchQuery  string
	ErrorMessage string
	SuccessMsg   string
	ActivePage   string
}

// DashboardHandler handles Web UI HTTP requests for SkillBase.
type DashboardHandler struct {
	skillRepo     *repository.SkillRepository
	targetRepo    *repository.TargetRepository
	syncService   *services.SyncService
	vaultService  *services.VaultService
	githubService *services.GitHubService
}

// NewDashboardHandler initializes a DashboardHandler with required repositories and services.
func NewDashboardHandler(
	skillRepo *repository.SkillRepository,
	targetRepo *repository.TargetRepository,
	syncService *services.SyncService,
	vaultService *services.VaultService,
	githubService *services.GitHubService,
) *DashboardHandler {
	return &DashboardHandler{
		skillRepo:     skillRepo,
		targetRepo:    targetRepo,
		syncService:   syncService,
		vaultService:  vaultService,
		githubService: githubService,
	}
}

// RenderOverview handles GET / rendering the clean overview dashboard page.
func (h *DashboardHandler) RenderOverview(c echo.Context) error {
	skills, err := h.skillRepo.GetAll("")
	if err != nil {
		return c.String(http.StatusInternalServerError, "Failed to load skills: "+err.Error())
	}
	targets, err := h.targetRepo.GetAll()
	if err != nil {
		targets = []models.AgentTarget{}
	}

	data := DashboardData{
		Skills:      skills,
		Targets:     h.prepareTargetViews(targets),
		TotalSkills: len(skills),
		ActivePage:  "overview",
	}
	return c.Render(http.StatusOK, "overview.html", data)
}

// RenderDashboard handles GET / rendering the full HTML dashboard page (delegates to RenderOverview).
func (h *DashboardHandler) RenderDashboard(c echo.Context) error {
	return h.RenderOverview(c)
}

// RenderSkillsLibrary handles GET /skills rendering the full Skills Library page.
func (h *DashboardHandler) RenderSkillsLibrary(c echo.Context) error {
	skills, err := h.skillRepo.GetAll("")
	if err != nil {
		return c.String(http.StatusInternalServerError, "Failed to load skills: "+err.Error())
	}
	targets, err := h.targetRepo.GetAll()
	if err != nil {
		targets = []models.AgentTarget{}
	}

	data := DashboardData{
		Skills:      skills,
		Targets:     h.prepareTargetViews(targets),
		TotalSkills: len(skills),
		ActivePage:  "skills",
	}
	return c.Render(http.StatusOK, "skills.html", data)
}

// RenderTargets handles GET /targets rendering the Agent Targets page.
func (h *DashboardHandler) RenderTargets(c echo.Context) error {
	targets, err := h.targetRepo.GetAll()
	if err != nil {
		targets = []models.AgentTarget{}
	}
	skills, _ := h.skillRepo.GetAll("")

	data := DashboardData{
		Skills:      skills,
		Targets:     h.prepareTargetViews(targets),
		TotalSkills: len(skills),
		ActivePage:  "targets",
	}
	return c.Render(http.StatusOK, "targets.html", data)
}

// CreateTarget handles POST /targets creating a new Agent Target directory configuration.
func (h *DashboardHandler) CreateTarget(c echo.Context) error {
	name := strings.TrimSpace(c.FormValue("name"))
	path := strings.TrimSpace(c.FormValue("path"))
	agentType := strings.TrimSpace(c.FormValue("agent_type"))
	if agentType == "" {
		agentType = "custom"
	}
	syncMode := strings.TrimSpace(c.FormValue("sync_mode"))
	if syncMode == "" {
		syncMode = "symlink"
	}
	description := strings.TrimSpace(c.FormValue("description"))

	if name != "" && path != "" {
		target := &models.AgentTarget{
			Name:        name,
			Path:        path,
			AgentType:   agentType,
			SyncMode:    syncMode,
			IsActive:    true,
			Description: description,
		}
		_ = h.targetRepo.Create(target)

		// Auto-scan and ingest existing skills from target directory upon creation
		h.ingestSkillsFromTarget(target.Path)
	}

	return h.RenderTargets(c)
}

// ScanTarget handles POST /targets/:id/scan explicitly triggering scan & ingestion on a target directory.
func (h *DashboardHandler) ScanTarget(c echo.Context) error {
	idParam := c.Param("id")
	id, err := strconv.ParseInt(idParam, 10, 64)
	if err == nil {
		target, err := h.targetRepo.GetByID(id)
		if err == nil && target != nil {
			h.ingestSkillsFromTarget(target.Path)
		}
	}
	return h.RenderTargets(c)
}

// ingestSkillsFromTarget helper scans target directory and saves discovered skills to DB & Vault.
func (h *DashboardHandler) ingestSkillsFromTarget(targetPath string) {
	if h.syncService == nil {
		return
	}

	discovered, err := h.syncService.ScanAndIngestTarget(targetPath)
	if err != nil || len(discovered) == 0 {
		return
	}

	for _, s := range discovered {
		existing, _ := h.skillRepo.GetBySlug(s.Slug)
		if existing != nil {
			existing.Content = s.Content
			if existing.Name == "" {
				existing.Name = s.Name
			}
			_ = h.skillRepo.Update(existing)
		} else {
			newSkill := &models.Skill{
				Name:        s.Name,
				Slug:        s.Slug,
				Description: "Auto-ingested from agent target: " + targetPath,
				Content:     s.Content,
				SourceType:  "custom",
				Tags:        "ingested,local",
			}
			_ = h.skillRepo.Create(newSkill)
		}
	}
}

// SearchSkills handles GET /skills/search returning filtered skill grid partial.
func (h *DashboardHandler) SearchSkills(c echo.Context) error {
	q := strings.TrimSpace(c.QueryParam("q"))
	source := strings.TrimSpace(c.QueryParam("source"))
	skills, err := h.skillRepo.GetAllFiltered(q, source)
	if err != nil {
		return c.String(http.StatusInternalServerError, "Failed to search skills: "+err.Error())
	}
	targets, _ := h.targetRepo.GetAll()

	data := DashboardData{
		Skills:      skills,
		Targets:     h.prepareTargetViews(targets),
		TotalSkills: len(skills),
		SearchQuery: q,
	}
	return c.Render(http.StatusOK, "skill_list.html", data)
}

// ImportSkill handles POST /skills/import fetching GitHub skill file and saving it.
func (h *DashboardHandler) ImportSkill(c echo.Context) error {
	skillURL := strings.TrimSpace(c.FormValue("url"))
	if skillURL == "" {
		skills, _ := h.skillRepo.GetAll("")
		targets, _ := h.targetRepo.GetAll()
		return c.Render(http.StatusBadRequest, "skill_list.html", DashboardData{
			Skills:       skills,
			Targets:      h.prepareTargetViews(targets),
			TotalSkills:  len(skills),
			ErrorMessage: "GitHub URL must not be empty.",
		})
	}

	fetchedSkill, err := h.githubService.FetchSkillFromURL(skillURL)
	if err != nil {
		skills, _ := h.skillRepo.GetAll("")
		targets, _ := h.targetRepo.GetAll()
		return c.Render(http.StatusBadRequest, "skill_list.html", DashboardData{
			Skills:       skills,
			Targets:      h.prepareTargetViews(targets),
			TotalSkills:  len(skills),
			ErrorMessage: "Failed to import skill: " + err.Error(),
		})
	}

	// Check if skill with same slug already exists
	existing, _ := h.skillRepo.GetBySlug(fetchedSkill.Slug)
	if existing != nil {
		fetchedSkill.ID = existing.ID
		if err := h.skillRepo.Update(fetchedSkill); err != nil {
			skills, _ := h.skillRepo.GetAll("")
			targets, _ := h.targetRepo.GetAll()
			return c.Render(http.StatusInternalServerError, "skill_list.html", DashboardData{
				Skills:       skills,
				Targets:      h.prepareTargetViews(targets),
				TotalSkills:  len(skills),
				ErrorMessage: "Failed to update existing skill: " + err.Error(),
			})
		}
	} else {
		if err := h.skillRepo.Create(fetchedSkill); err != nil {
			skills, _ := h.skillRepo.GetAll("")
			targets, _ := h.targetRepo.GetAll()
			return c.Render(http.StatusInternalServerError, "skill_list.html", DashboardData{
				Skills:       skills,
				Targets:      h.prepareTargetViews(targets),
				TotalSkills:  len(skills),
				ErrorMessage: "Failed to save imported skill: " + err.Error(),
			})
		}
	}

	if h.vaultService != nil {
		_ = h.vaultService.SaveSkillToVault(fetchedSkill.Slug, fetchedSkill.Content)
	}

	skills, _ := h.skillRepo.GetAll("")
	targets, _ := h.targetRepo.GetAll()
	return c.Render(http.StatusOK, "skill_list.html", DashboardData{
		Skills:      skills,
		Targets:     h.prepareTargetViews(targets),
		TotalSkills: len(skills),
		SuccessMsg:  "Successfully imported skill: " + fetchedSkill.Name,
	})
}

// CreateSkill handles POST /skills creating or updating custom skills.
func (h *DashboardHandler) CreateSkill(c echo.Context) error {
	idStr := strings.TrimSpace(c.FormValue("id"))
	name := strings.TrimSpace(c.FormValue("name"))
	slug := strings.TrimSpace(c.FormValue("slug"))
	description := strings.TrimSpace(c.FormValue("description"))
	content := strings.TrimSpace(c.FormValue("content"))
	tags := strings.TrimSpace(c.FormValue("tags"))

	if name == "" || content == "" {
		skills, _ := h.skillRepo.GetAll("")
		targets, _ := h.targetRepo.GetAll()
		return c.Render(http.StatusBadRequest, "skill_list.html", DashboardData{
			Skills:       skills,
			Targets:      h.prepareTargetViews(targets),
			TotalSkills:  len(skills),
			ErrorMessage: "Skill name and content are required.",
		})
	}

	var id int64
	if idStr != "" {
		id, _ = strconv.ParseInt(idStr, 10, 64)
	}

	skill := &models.Skill{
		ID:          id,
		Name:        name,
		Slug:        slug,
		Description: description,
		Content:     content,
		Tags:        tags,
		SourceType:  "custom",
	}

	if id > 0 {
		if err := h.skillRepo.Update(skill); err != nil {
			skills, _ := h.skillRepo.GetAll("")
			targets, _ := h.targetRepo.GetAll()
			return c.Render(http.StatusInternalServerError, "skill_list.html", DashboardData{
				Skills:       skills,
				Targets:      h.prepareTargetViews(targets),
				TotalSkills:  len(skills),
				ErrorMessage: "Failed to update skill: " + err.Error(),
			})
		}
	} else {
		if err := h.skillRepo.Create(skill); err != nil {
			skills, _ := h.skillRepo.GetAll("")
			targets, _ := h.targetRepo.GetAll()
			return c.Render(http.StatusInternalServerError, "skill_list.html", DashboardData{
				Skills:       skills,
				Targets:      h.prepareTargetViews(targets),
				TotalSkills:  len(skills),
				ErrorMessage: "Failed to create skill: " + err.Error(),
			})
		}
	}

	if h.vaultService != nil {
		_ = h.vaultService.SaveSkillToVault(skill.Slug, skill.Content)
	}

	skills, _ := h.skillRepo.GetAll("")
	targets, _ := h.targetRepo.GetAll()
	return c.Render(http.StatusOK, "skill_list.html", DashboardData{
		Skills:      skills,
		Targets:     h.prepareTargetViews(targets),
		TotalSkills: len(skills),
		SuccessMsg:  "Skill saved successfully!",
	})
}

// DeleteSkill handles DELETE /skills/:id deleting a skill by ID.
func (h *DashboardHandler) DeleteSkill(c echo.Context) error {
	idParam := c.Param("id")
	id, err := strconv.ParseInt(idParam, 10, 64)
	if err != nil {
		skills, _ := h.skillRepo.GetAll("")
		targets, _ := h.targetRepo.GetAll()
		return c.Render(http.StatusBadRequest, "skill_list.html", DashboardData{
			Skills:       skills,
			Targets:      h.prepareTargetViews(targets),
			TotalSkills:  len(skills),
			ErrorMessage: "Invalid skill ID format.",
		})
	}

	skill, err := h.skillRepo.GetByID(id)
	if err == nil && skill != nil {
		_ = h.skillRepo.Delete(id)
		if h.vaultService != nil {
			_ = h.vaultService.DeleteSkillFromVault(skill.Slug)
		}
	}

	skills, _ := h.skillRepo.GetAll("")
	targets, _ := h.targetRepo.GetAll()
	return c.Render(http.StatusOK, "skill_list.html", DashboardData{
		Skills:      skills,
		Targets:     h.prepareTargetViews(targets),
		TotalSkills: len(skills),
		SuccessMsg:  "Skill deleted successfully.",
	})
}

// DeploySkill handles POST /skills/:id/deploy deploying a skill to a specific agent target.
func (h *DashboardHandler) DeploySkill(c echo.Context) error {
	idParam := c.Param("id")
	id, err := strconv.ParseInt(idParam, 10, 64)
	if err != nil {
		return c.String(http.StatusBadRequest, "Invalid skill ID")
	}

	targetIDStr := c.FormValue("target_id")
	targetID, err := strconv.ParseInt(targetIDStr, 10, 64)
	if err != nil {
		return c.String(http.StatusBadRequest, "Invalid target ID")
	}

	skill, err := h.skillRepo.GetByID(id)
	if err != nil || skill == nil {
		return c.String(http.StatusNotFound, "Skill not found")
	}

	target, err := h.targetRepo.GetByID(targetID)
	if err != nil || target == nil {
		return c.String(http.StatusNotFound, "Target not found")
	}

	deployedType, err := h.syncService.DeploySkill(skill, target)
	if err != nil {
		return c.String(http.StatusInternalServerError, "Deployment failed: "+err.Error())
	}

	return c.String(http.StatusOK, fmt.Sprintf("Successfully deployed skill '%s' to '%s' via %s", skill.Name, target.Name, deployedType))
}

