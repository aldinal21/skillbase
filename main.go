package main

import (
	"log"
	"net/http"
	"os"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"

	"skillcraft/internal/database"
	"skillcraft/internal/handlers"
	"skillcraft/internal/repository"
	"skillcraft/internal/services"
)

func main() {
	dbPath := os.Getenv("SKILLCRAFT_DB")
	if dbPath == "" {
		dbPath = "skillcraft.db"
	}

	db, err := database.InitDB(dbPath)
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer db.Close()

	// Initialize repositories
	skillRepo := repository.NewSkillRepository(db)
	targetRepo := repository.NewTargetRepository(db)

	// Initialize services
	vaultService := services.NewVaultService("storage/skills")
	syncService := services.NewSyncService(vaultService)
	githubService := services.NewGitHubService(nil)

	// Initialize template renderer
	renderer, err := handlers.NewTemplateRendererFromDir("web")
	if err != nil {
		log.Fatalf("Failed to load HTML templates: %v", err)
	}

	// Initialize Echo instance
	e := echo.New()
	e.HideBanner = true
	e.Renderer = renderer

	e.Use(middleware.Logger())
	e.Use(middleware.Recover())

	// Initialize handlers
	dashboardHandler := handlers.NewDashboardHandler(
		skillRepo,
		targetRepo,
		syncService,
		vaultService,
		githubService,
	)

	// Register Web UI Routes
	e.GET("/", dashboardHandler.RenderDashboard)
	e.GET("/skills/search", dashboardHandler.SearchSkills)
	e.POST("/skills", dashboardHandler.CreateSkill)
	e.POST("/skills/import", dashboardHandler.ImportSkill)
	e.DELETE("/skills/:id", dashboardHandler.DeleteSkill)

	// Static files route if web/static directory exists
	e.Static("/static", "web/static")

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Starting SkillCraft Web Server on http://localhost:%s", port)
	if err := e.Start(":" + port); err != nil && err != http.ErrServerClosed {
		log.Fatalf("Server execution failed: %v", err)
	}
}
