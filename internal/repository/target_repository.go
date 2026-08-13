package repository

import (
	"database/sql"
	"fmt"

	"skillbase/internal/models"
)

// TargetRepository manages CRUD operations for AgentTarget records in SQLite.
type TargetRepository struct {
	db *sql.DB
}

// NewTargetRepository initializes a new TargetRepository with the provided *sql.DB connection.
func NewTargetRepository(db *sql.DB) *TargetRepository {
	return &TargetRepository{db: db}
}

// Create inserts a new agent target destination path into database.
func (r *TargetRepository) Create(t *models.AgentTarget) error {
	if t.AgentType == "" {
		t.AgentType = "custom"
	}
	if t.SyncMode == "" {
		t.SyncMode = "symlink"
	}

	query := `INSERT INTO agent_targets (name, agent_type, description, path, sync_mode, is_active) VALUES (?, ?, ?, ?, ?, ?)`
	res, err := r.db.Exec(query, t.Name, t.AgentType, t.Description, t.Path, t.SyncMode, t.IsActive)
	if err != nil {
		return fmt.Errorf("failed to insert agent target: %w", err)
	}

	id, err := res.LastInsertId()
	if err != nil {
		return fmt.Errorf("failed to get last insert id: %w", err)
	}
	t.ID = id

	return nil
}

// GetByID retrieves an agent target by its ID.
func (r *TargetRepository) GetByID(id int64) (*models.AgentTarget, error) {
	query := `SELECT id, name, agent_type, description, path, sync_mode, is_active FROM agent_targets WHERE id = ?`
	var t models.AgentTarget
	err := r.db.QueryRow(query, id).Scan(&t.ID, &t.Name, &t.AgentType, &t.Description, &t.Path, &t.SyncMode, &t.IsActive)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

// GetAll retrieves all agent target destinations ordered by ID ascending.
func (r *TargetRepository) GetAll() ([]models.AgentTarget, error) {
	query := `SELECT id, name, agent_type, description, path, sync_mode, is_active FROM agent_targets ORDER BY id ASC`
	rows, err := r.db.Query(query)
	if err != nil {
		return nil, fmt.Errorf("failed to query agent targets: %w", err)
	}
	defer rows.Close()

	targets := make([]models.AgentTarget, 0)
	for rows.Next() {
		var t models.AgentTarget
		err := rows.Scan(&t.ID, &t.Name, &t.AgentType, &t.Description, &t.Path, &t.SyncMode, &t.IsActive)
		if err != nil {
			return nil, fmt.Errorf("failed to scan agent target row: %w", err)
		}
		targets = append(targets, t)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating agent target rows: %w", err)
	}

	return targets, nil
}

// GetActive retrieves all active agent target destinations ordered by ID ascending.
func (r *TargetRepository) GetActive() ([]models.AgentTarget, error) {
	query := `SELECT id, name, agent_type, description, path, sync_mode, is_active FROM agent_targets WHERE is_active = 1 ORDER BY id ASC`
	rows, err := r.db.Query(query)
	if err != nil {
		return nil, fmt.Errorf("failed to query active agent targets: %w", err)
	}
	defer rows.Close()

	targets := make([]models.AgentTarget, 0)
	for rows.Next() {
		var t models.AgentTarget
		err := rows.Scan(&t.ID, &t.Name, &t.AgentType, &t.Description, &t.Path, &t.SyncMode, &t.IsActive)
		if err != nil {
			return nil, fmt.Errorf("failed to scan active agent target row: %w", err)
		}
		targets = append(targets, t)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating active agent target rows: %w", err)
	}

	return targets, nil
}

// Update updates an existing agent target record. Returns sql.ErrNoRows if ID does not exist.
func (r *TargetRepository) Update(t *models.AgentTarget) error {
	if t.AgentType == "" {
		t.AgentType = "custom"
	}
	if t.SyncMode == "" {
		t.SyncMode = "symlink"
	}

	query := `UPDATE agent_targets SET name = ?, agent_type = ?, description = ?, path = ?, sync_mode = ?, is_active = ? WHERE id = ?`
	res, err := r.db.Exec(query, t.Name, t.AgentType, t.Description, t.Path, t.SyncMode, t.IsActive, t.ID)
	if err != nil {
		return fmt.Errorf("failed to update agent target: %w", err)
	}

	rows, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}
	if rows == 0 {
		return sql.ErrNoRows
	}

	return nil
}

// Delete removes an agent target by ID. Returns sql.ErrNoRows if ID does not exist.
func (r *TargetRepository) Delete(id int64) error {
	query := `DELETE FROM agent_targets WHERE id = ?`
	res, err := r.db.Exec(query, id)
	if err != nil {
		return fmt.Errorf("failed to delete agent target: %w", err)
	}

	rows, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}
	if rows == 0 {
		return sql.ErrNoRows
	}

	return nil
}

// SeedDefaultPresets seeds the default global agent target presets if they do not already exist.
func (r *TargetRepository) SeedDefaultPresets() error {
	defaultPresets := []models.AgentTarget{
		{
			Name:        "Universal Agents",
			AgentType:   "universal",
			Description: "Open Agent Skills standard global path for all agents",
			Path:        "~/.agents/skills",
			SyncMode:    "symlink",
			IsActive:    true,
		},
		{
			Name:        "Claude Code",
			AgentType:   "claude",
			Description: "Global skill folder for Anthropic Claude CLI",
			Path:        "~/.claude/skills",
			SyncMode:    "symlink",
			IsActive:    true,
		},
		{
			Name:        "Antigravity CLI",
			AgentType:   "antigravity",
			Description: "Global skill folder for Google Antigravity CLI",
			Path:        "~/.gemini/antigravity-cli/skills",
			SyncMode:    "symlink",
			IsActive:    true,
		},
		{
			Name:        "OpenCode Global",
			AgentType:   "opencode",
			Description: "Global skill folder for OpenCode agent",
			Path:        "~/.opencode/skills",
			SyncMode:    "symlink",
			IsActive:    true,
		},
	}

	for _, preset := range defaultPresets {
		var count int
		err := r.db.QueryRow(`SELECT COUNT(1) FROM agent_targets WHERE agent_type = ? OR path = ?`, preset.AgentType, preset.Path).Scan(&count)
		if err != nil {
			return fmt.Errorf("failed to check existing preset target %s: %w", preset.Name, err)
		}
		if count == 0 {
			target := preset
			if err := r.Create(&target); err != nil {
				return fmt.Errorf("failed to seed default preset %s: %w", preset.Name, err)
			}
		}
	}

	return nil
}
