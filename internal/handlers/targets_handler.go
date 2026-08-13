package handlers

import (
	"net/http"

	"github.com/labstack/echo/v4"
	"skillbase/internal/models"
	"skillbase/internal/services"
)

// TargetView wraps models.AgentTarget with computed view fields such as ExpandedPath.
type TargetView struct {
	models.AgentTarget
	ExpandedPath string
}

// prepareTargetViews converts []models.AgentTarget into []TargetView with expanded absolute paths.
func (h *DashboardHandler) prepareTargetViews(targets []models.AgentTarget) []TargetView {
	views := make([]TargetView, 0, len(targets))
	for _, t := range targets {
		expanded, err := services.ExpandPath(t.Path)
		if err != nil {
			expanded = t.Path
		}
		views = append(views, TargetView{
			AgentTarget:  t,
			ExpandedPath: expanded,
		})
	}
	return views
}

// SeedPresets handles POST /targets/seed-presets to load default agent target presets.
func (h *DashboardHandler) SeedPresets(c echo.Context) error {
	if err := h.targetRepo.SeedDefaultPresets(); err != nil {
		return c.String(http.StatusInternalServerError, "Failed to seed target presets: "+err.Error())
	}
	return h.RenderTargets(c)
}
