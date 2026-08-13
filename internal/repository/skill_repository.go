package repository

import (
	"database/sql"
	"fmt"
	"strings"

	"skillbase/internal/models"
)

// SkillRepository manages CRUD operations for skills in SQLite.
type SkillRepository struct {
	db *sql.DB
}

// NewSkillRepository initializes a new SkillRepository with the provided *sql.DB connection.
func NewSkillRepository(db *sql.DB) *SkillRepository {
	return &SkillRepository{db: db}
}

// Create inserts a new skill into database and sets the ID, CreatedAt, and UpdatedAt.
func (r *SkillRepository) Create(s *models.Skill) error {
	if s.Slug == "" {
		s.GenerateSlug()
	}
	if s.SourceType == "" {
		s.SourceType = "custom"
	}

	query := `INSERT INTO skills (name, slug, description, content, tags, source_type, source_url, created_at, updated_at) 
	          VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`

	res, err := r.db.Exec(query, s.Name, s.Slug, s.Description, s.Content, s.Tags, s.SourceType, s.SourceURL)
	if err != nil {
		return fmt.Errorf("failed to insert skill: %w", err)
	}

	id, err := res.LastInsertId()
	if err != nil {
		return fmt.Errorf("failed to get last insert id: %w", err)
	}
	s.ID = id

	err = r.db.QueryRow("SELECT created_at, updated_at FROM skills WHERE id = ?", s.ID).Scan(&s.CreatedAt, &s.UpdatedAt)
	if err != nil {
		return fmt.Errorf("failed to scan timestamps: %w", err)
	}

	return nil
}

// GetByID retrieves a skill by its primary key ID.
func (r *SkillRepository) GetByID(id int64) (*models.Skill, error) {
	query := `SELECT id, name, slug, description, content, tags, source_type, source_url, created_at, updated_at 
	          FROM skills WHERE id = ?`
	var s models.Skill
	err := r.db.QueryRow(query, id).Scan(
		&s.ID, &s.Name, &s.Slug, &s.Description, &s.Content, &s.Tags, &s.SourceType, &s.SourceURL, &s.CreatedAt, &s.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &s, nil
}

// GetBySlug retrieves a skill by its unique slug string.
func (r *SkillRepository) GetBySlug(slug string) (*models.Skill, error) {
	query := `SELECT id, name, slug, description, content, tags, source_type, source_url, created_at, updated_at 
	          FROM skills WHERE slug = ?`
	var s models.Skill
	err := r.db.QueryRow(query, slug).Scan(
		&s.ID, &s.Name, &s.Slug, &s.Description, &s.Content, &s.Tags, &s.SourceType, &s.SourceURL, &s.CreatedAt, &s.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &s, nil
}

// GetAll retrieves all skills from database. If search string is non-empty,
// it filters results matching name, slug, description, tags, or content.
func (r *SkillRepository) GetAll(search string) ([]models.Skill, error) {
	return r.GetAllFiltered(search, "")
}

// GetAllFiltered retrieves skills filtered by search query and sourceType ("custom", "github", etc.).
func (r *SkillRepository) GetAllFiltered(search, sourceType string) ([]models.Skill, error) {
	var query string
	var args []interface{}
	var conditions []string

	if search != "" {
		conditions = append(conditions, "(name LIKE ? OR slug LIKE ? OR description LIKE ? OR tags LIKE ? OR content LIKE ?)")
		pattern := "%" + search + "%"
		args = append(args, pattern, pattern, pattern, pattern, pattern)
	}

	if sourceType != "" && sourceType != "all" {
		conditions = append(conditions, "source_type = ?")
		args = append(args, sourceType)
	}

	query = "SELECT id, name, slug, description, content, tags, source_type, source_url, created_at, updated_at FROM skills"
	if len(conditions) > 0 {
		query += " WHERE " + strings.Join(conditions, " AND ")
	}
	query += " ORDER BY updated_at DESC, id DESC"

	rows, err := r.db.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to query skills: %w", err)
	}
	defer rows.Close()

	skills := make([]models.Skill, 0)
	for rows.Next() {
		var s models.Skill
		err := rows.Scan(
			&s.ID, &s.Name, &s.Slug, &s.Description, &s.Content, &s.Tags, &s.SourceType, &s.SourceURL, &s.CreatedAt, &s.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan skill row: %w", err)
		}
		skills = append(skills, s)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating skill rows: %w", err)
	}

	return skills, nil
}

// Update modifies an existing skill in database by ID.
func (r *SkillRepository) Update(s *models.Skill) error {
	if s.Slug == "" {
		s.GenerateSlug()
	}
	if s.SourceType == "" {
		s.SourceType = "custom"
	}

	query := `UPDATE skills 
	          SET name = ?, slug = ?, description = ?, content = ?, tags = ?, source_type = ?, source_url = ?, updated_at = CURRENT_TIMESTAMP 
	          WHERE id = ?`
	res, err := r.db.Exec(query, s.Name, s.Slug, s.Description, s.Content, s.Tags, s.SourceType, s.SourceURL, s.ID)
	if err != nil {
		return fmt.Errorf("failed to update skill: %w", err)
	}

	rows, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}
	if rows == 0 {
		return sql.ErrNoRows
	}

	_ = r.db.QueryRow("SELECT updated_at FROM skills WHERE id = ?", s.ID).Scan(&s.UpdatedAt)

	return nil
}

// Delete removes a skill from database by ID. Returns sql.ErrNoRows if ID does not exist.
func (r *SkillRepository) Delete(id int64) error {
	query := `DELETE FROM skills WHERE id = ?`
	res, err := r.db.Exec(query, id)
	if err != nil {
		return fmt.Errorf("failed to delete skill: %w", err)
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
