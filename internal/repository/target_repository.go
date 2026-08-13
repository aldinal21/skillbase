package repository

import (
	"database/sql"
	"fmt"

	"skillcraft/internal/models"
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
	if t.SyncMode == "" {
		t.SyncMode = "symlink"
	}

	query := `INSERT INTO agent_targets (name, path, sync_mode, is_active) VALUES (?, ?, ?, ?)`
	res, err := r.db.Exec(query, t.Name, t.Path, t.SyncMode, t.IsActive)
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
	query := `SELECT id, name, path, sync_mode, is_active FROM agent_targets WHERE id = ?`
	var t models.AgentTarget
	err := r.db.QueryRow(query, id).Scan(&t.ID, &t.Name, &t.Path, &t.SyncMode, &t.IsActive)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

// GetAll retrieves all agent target destinations ordered by ID ascending.
func (r *TargetRepository) GetAll() ([]models.AgentTarget, error) {
	query := `SELECT id, name, path, sync_mode, is_active FROM agent_targets ORDER BY id ASC`
	rows, err := r.db.Query(query)
	if err != nil {
		return nil, fmt.Errorf("failed to query agent targets: %w", err)
	}
	defer rows.Close()

	targets := make([]models.AgentTarget, 0)
	for rows.Next() {
		var t models.AgentTarget
		err := rows.Scan(&t.ID, &t.Name, &t.Path, &t.SyncMode, &t.IsActive)
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
