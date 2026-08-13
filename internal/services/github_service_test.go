package services

import (
	"bytes"
	"io"
	"net/http"
	"strings"
	"testing"
)

type mockTransport struct {
	fn func(req *http.Request) (*http.Response, error)
}

func (m *mockTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	return m.fn(req)
}

func TestConvertToRawURL(t *testing.T) {
	svc := NewGitHubService(nil)

	tests := []struct {
		name      string
		input     string
		expected  string
		expectErr bool
	}{
		{
			name:      "Standard GitHub blob URL",
			input:     "https://github.com/octocat/Hello-World/blob/master/skills/my-skill/SKILL.md",
			expected:  "https://raw.githubusercontent.com/octocat/Hello-World/master/skills/my-skill/SKILL.md",
			expectErr: false,
		},
		{
			name:      "GitHub URL with /raw/ path",
			input:     "https://github.com/octocat/Hello-World/raw/main/SKILL.md",
			expected:  "https://raw.githubusercontent.com/octocat/Hello-World/main/SKILL.md",
			expectErr: false,
		},
		{
			name:      "Already raw GitHub URL",
			input:     "https://raw.githubusercontent.com/octocat/Hello-World/master/skills/my-skill/SKILL.md",
			expected:  "https://raw.githubusercontent.com/octocat/Hello-World/master/skills/my-skill/SKILL.md",
			expectErr: false,
		},
		{
			name:      "GitHub URL without scheme",
			input:     "github.com/octocat/Hello-World/blob/v1.0.0/SKILL.md",
			expected:  "https://raw.githubusercontent.com/octocat/Hello-World/v1.0.0/SKILL.md",
			expectErr: false,
		},
		{
			name:      "Non-GitHub URL",
			input:     "https://gitlab.com/owner/repo/blob/main/SKILL.md",
			expected:  "",
			expectErr: true,
		},
		{
			name:      "GitHub repo root (no file)",
			input:     "https://github.com/octocat/Hello-World",
			expected:  "",
			expectErr: true,
		},
		{
			name:      "Invalid raw GitHub URL structure",
			input:     "https://raw.githubusercontent.com/octocat/Hello-World",
			expected:  "",
			expectErr: true,
		},
		{
			name:      "Empty URL",
			input:     "",
			expected:  "",
			expectErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := svc.ConvertToRawURL(tt.input)
			if (err != nil) != tt.expectErr {
				t.Fatalf("ConvertToRawURL(%q) error = %v, expectErr %v", tt.input, err, tt.expectErr)
			}
			if result != tt.expected {
				t.Errorf("ConvertToRawURL(%q) = %q, want %q", tt.input, result, tt.expected)
			}
		})
	}
}

func TestFetchSkillFromURL(t *testing.T) {
	t.Run("Fetch skill with frontmatter", func(t *testing.T) {
		mockBody := `---
name: Frontmatter Skill
description: A description from YAML frontmatter.
tags: yaml, test
---

# Frontmatter Skill Title
Some content body here.`

		mockClient := &http.Client{
			Transport: &mockTransport{
				fn: func(req *http.Request) (*http.Response, error) {
					if req.URL.String() != "https://raw.githubusercontent.com/user/repo/main/skills/frontmatter/SKILL.md" {
						t.Errorf("Unexpected request URL: %s", req.URL.String())
					}
					return &http.Response{
						StatusCode: http.StatusOK,
						Body:       io.NopCloser(bytes.NewBufferString(mockBody)),
					}, nil
				},
			},
		}

		svc := NewGitHubService(mockClient)
		inputURL := "https://github.com/user/repo/blob/main/skills/frontmatter/SKILL.md"

		skill, err := svc.FetchSkillFromURL(inputURL)
		if err != nil {
			t.Fatalf("FetchSkillFromURL failed unexpectedly: %v", err)
		}

		if skill.Name != "Frontmatter Skill" {
			t.Errorf("Expected Name 'Frontmatter Skill', got %q", skill.Name)
		}
		if skill.Slug != "frontmatter-skill" {
			t.Errorf("Expected Slug 'frontmatter-skill', got %q", skill.Slug)
		}
		if skill.Description != "A description from YAML frontmatter." {
			t.Errorf("Expected Description 'A description from YAML frontmatter.', got %q", skill.Description)
		}
		if skill.Tags != "yaml, test" {
			t.Errorf("Expected Tags 'yaml, test', got %q", skill.Tags)
		}
		if skill.SourceType != "github" {
			t.Errorf("Expected SourceType 'github', got %q", skill.SourceType)
		}
		if skill.SourceURL != inputURL {
			t.Errorf("Expected SourceURL %q, got %q", inputURL, skill.SourceURL)
		}
	})

	t.Run("Fetch skill with H1 header and paragraph fallback", func(t *testing.T) {
		mockBody := `# Header Skill Title

This is a paragraph description extracted from markdown body.

## Next Section
More details...`

		mockClient := &http.Client{
			Transport: &mockTransport{
				fn: func(req *http.Request) (*http.Response, error) {
					return &http.Response{
						StatusCode: http.StatusOK,
						Body:       io.NopCloser(bytes.NewBufferString(mockBody)),
					}, nil
				},
			},
		}

		svc := NewGitHubService(mockClient)
		inputURL := "https://github.com/user/repo/blob/main/skills/header-skill/SKILL.md"

		skill, err := svc.FetchSkillFromURL(inputURL)
		if err != nil {
			t.Fatalf("FetchSkillFromURL failed unexpectedly: %v", err)
		}

		if skill.Name != "Header Skill Title" {
			t.Errorf("Expected Name 'Header Skill Title', got %q", skill.Name)
		}
		if skill.Slug != "header-skill-title" {
			t.Errorf("Expected Slug 'header-skill-title', got %q", skill.Slug)
		}
		if skill.Description != "This is a paragraph description extracted from markdown body." {
			t.Errorf("Expected Description extracted, got %q", skill.Description)
		}
	})

	t.Run("Fetch skill HTTP 404 error", func(t *testing.T) {
		mockClient := &http.Client{
			Transport: &mockTransport{
				fn: func(req *http.Request) (*http.Response, error) {
					return &http.Response{
						StatusCode: http.StatusNotFound,
						Body:       io.NopCloser(bytes.NewBufferString("404 Not Found")),
					}, nil
				},
			},
		}

		svc := NewGitHubService(mockClient)
		_, err := svc.FetchSkillFromURL("https://github.com/user/repo/blob/main/missing/SKILL.md")
		if err == nil {
			t.Fatal("Expected error for 404 status code, got nil")
		}
		if !strings.Contains(err.Error(), "404") {
			t.Errorf("Expected error to mention status 404, got %v", err)
		}
	})

	t.Run("Fetch skill with invalid URL", func(t *testing.T) {
		svc := NewGitHubService(nil)
		_, err := svc.FetchSkillFromURL("invalid-url")
		if err == nil {
			t.Fatal("Expected error for invalid URL, got nil")
		}
	})

	t.Run("Fetch skill with empty response content", func(t *testing.T) {
		mockClient := &http.Client{
			Transport: &mockTransport{
				fn: func(req *http.Request) (*http.Response, error) {
					return &http.Response{
						StatusCode: http.StatusOK,
						Body:       io.NopCloser(bytes.NewBufferString("   \n  ")),
					}, nil
				},
			},
		}

		svc := NewGitHubService(mockClient)
		_, err := svc.FetchSkillFromURL("https://github.com/user/repo/blob/main/empty/SKILL.md")
		if err == nil {
			t.Fatal("Expected error for empty response body, got nil")
		}
	})
}
