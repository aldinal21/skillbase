package services

import (
	"os"
	"path/filepath"
	"testing"
)

func TestExpandPath(t *testing.T) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		t.Fatalf("failed to get user home dir: %v", err)
	}

	tests := []struct {
		name     string
		input    string
		expected string
		wantErr  bool
	}{
		{
			name:     "expand tilde with subpath",
			input:    "~/.agents/skills",
			expected: filepath.Join(homeDir, ".agents", "skills"),
			wantErr:  false,
		},
		{
			name:     "expand tilde claude skills",
			input:    "~/.claude/skills",
			expected: filepath.Join(homeDir, ".claude", "skills"),
			wantErr:  false,
		},
		{
			name:     "expand tilde only",
			input:    "~",
			expected: homeDir,
			wantErr:  false,
		},
		{
			name:     "expand tilde with backslash",
			input:    `~\.agents\skills`,
			expected: filepath.Join(homeDir, ".agents", "skills"),
			wantErr:  false,
		},
		{
			name:     "relative path without tilde",
			input:    "relative/path/to/skill",
			expected: filepath.Clean("relative/path/to/skill"),
			wantErr:  false,
		},
		{
			name:     "absolute path without tilde",
			input:    filepath.Join(homeDir, "absolute", "path"),
			expected: filepath.Clean(filepath.Join(homeDir, "absolute", "path")),
			wantErr:  false,
		},
		{
			name:     "empty path",
			input:    "",
			expected: "",
			wantErr:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ExpandPath(tt.input)
			if (err != nil) != tt.wantErr {
				t.Errorf("ExpandPath(%q) error = %v, wantErr %v", tt.input, err, tt.wantErr)
				return
			}
			if got != tt.expected {
				t.Errorf("ExpandPath(%q) = %q, want %q", tt.input, got, tt.expected)
			}
		})
	}
}
