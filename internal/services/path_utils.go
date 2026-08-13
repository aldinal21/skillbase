package services

import (
	"os"
	"path/filepath"
	"strings"
)

// ExpandPath resolves tildes (~) at the start of a path to the user's home directory
// across Windows and POSIX systems.
func ExpandPath(path string) (string, error) {
	if path == "" {
		return "", nil
	}

	if path == "~" {
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		return homeDir, nil
	}

	if strings.HasPrefix(path, "~/") || strings.HasPrefix(path, "~\\") {
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		return filepath.Join(homeDir, path[2:]), nil
	}

	return filepath.Clean(path), nil
}
