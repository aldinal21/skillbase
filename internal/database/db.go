package database

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

// InitDB initializes SQLite database at the specified dbPath, runs DDL schema migrations,
// and returns an active *sql.DB connection pool.
func InitDB(dbPath string) (*sql.DB, error) {
	if dbPath != ":memory:" && dbPath != "" {
		dir := filepath.Dir(dbPath)
		if dir != "." && dir != "" {
			if err := os.MkdirAll(dir, 0755); err != nil {
				return nil, fmt.Errorf("failed to create directory for database: %w", err)
			}
		}
	}

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open sqlite database: %w", err)
	}

	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to ping sqlite database: %w", err)
	}

	if _, err := db.Exec("PRAGMA foreign_keys = ON;"); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to enable foreign keys: %w", err)
	}

	if err := migrateSchema(db); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to migrate database schema: %w", err)
	}

	return db, nil
}

func migrateSchema(db *sql.DB) error {
	schema := `
	CREATE TABLE IF NOT EXISTS skills (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		slug TEXT UNIQUE NOT NULL,
		description TEXT,
		content TEXT NOT NULL,
		tags TEXT,
		source_type TEXT DEFAULT 'custom',
		source_url TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS agent_targets (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		path TEXT NOT NULL,
		sync_mode TEXT DEFAULT 'symlink',
		is_active BOOLEAN DEFAULT 1
	);

	CREATE TABLE IF NOT EXISTS skill_deployments (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		skill_id INTEGER NOT NULL,
		target_id INTEGER NOT NULL,
		deployed_type TEXT NOT NULL,
		deployed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE,
		FOREIGN KEY (target_id) REFERENCES agent_targets(id) ON DELETE CASCADE
	);
	`

	_, err := db.Exec(schema)
	return err
}
