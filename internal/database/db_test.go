package database

import (
	"path/filepath"
	"testing"
)

func TestInitDB_InMemory(t *testing.T) {
	db, err := InitDB(":memory:")
	if err != nil {
		t.Fatalf("InitDB failed: %v", err)
	}
	defer db.Close()

	tables := []string{"skills", "agent_targets", "skill_deployments"}
	for _, table := range tables {
		var name string
		err := db.QueryRow("SELECT name FROM sqlite_master WHERE type='table' AND name=?", table).Scan(&name)
		if err != nil {
			t.Errorf("expected table %s to exist, but query failed: %v", table, err)
		}
		if name != table {
			t.Errorf("expected table name %s, got %s", table, name)
		}
	}
}

func TestInitDB_FileBasedAndIdempotent(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "sub_dir", "test_skillbase.db")

	// First initialization
	db1, err := InitDB(dbPath)
	if err != nil {
		t.Fatalf("First InitDB failed: %v", err)
	}

	// Insert test skill
	res, err := db1.Exec(`INSERT INTO skills (name, slug, content, tags) VALUES (?, ?, ?, ?)`,
		"Test Skill", "test-skill", "# Test", "test,go")
	if err != nil {
		t.Fatalf("Failed to insert skill: %v", err)
	}

	skillID, err := res.LastInsertId()
	if err != nil {
		t.Fatalf("Failed to get last insert id: %v", err)
	}

	// Insert test target
	resTarget, err := db1.Exec(`INSERT INTO agent_targets (name, path, sync_mode, is_active) VALUES (?, ?, ?, ?)`,
		"Antigravity Target", "/tmp/target", "symlink", 1)
	if err != nil {
		t.Fatalf("Failed to insert agent target: %v", err)
	}

	targetID, err := resTarget.LastInsertId()
	if err != nil {
		t.Fatalf("Failed to get target last insert id: %v", err)
	}

	// Insert deployment
	_, err = db1.Exec(`INSERT INTO skill_deployments (skill_id, target_id, deployed_type) VALUES (?, ?, ?)`,
		skillID, targetID, "symlink")
	if err != nil {
		t.Fatalf("Failed to insert deployment: %v", err)
	}

	db1.Close()

	// Second initialization on existing file (Idempotency test)
	db2, err := InitDB(dbPath)
	if err != nil {
		t.Fatalf("Second InitDB failed: %v", err)
	}
	defer db2.Close()

	var count int
	err = db2.QueryRow("SELECT COUNT(*) FROM skills").Scan(&count)
	if err != nil {
		t.Fatalf("Failed to query skills count from reopened DB: %v", err)
	}
	if count != 1 {
		t.Errorf("Expected 1 skill in DB, got %d", count)
	}
}

func TestInitDB_ForeignKeyEnforcement(t *testing.T) {
	db, err := InitDB(":memory:")
	if err != nil {
		t.Fatalf("InitDB failed: %v", err)
	}
	defer db.Close()

	// Attempt inserting deployment referencing non-existent skill and target
	_, err = db.Exec(`INSERT INTO skill_deployments (skill_id, target_id, deployed_type) VALUES (999, 999, 'symlink')`)
	if err == nil {
		t.Error("Expected foreign key constraint failure, but insert succeeded")
	}
}
