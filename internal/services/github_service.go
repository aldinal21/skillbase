package services

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"

	"skillbase/internal/models"
)

// GitHubService handles conversion of GitHub URLs and fetching skill content.
type GitHubService struct {
	client *http.Client
}

// NewGitHubService creates a new GitHubService instance.
// If client is nil, it defaults to an http.Client with a 15-second timeout.
func NewGitHubService(client *http.Client) *GitHubService {
	if client == nil {
		client = &http.Client{Timeout: 15 * time.Second}
	}
	return &GitHubService{
		client: client,
	}
}

// ConvertToRawURL transforms standard GitHub web URLs (including /blob/ and /raw/ links)
// into raw.githubusercontent.com URLs.
func (s *GitHubService) ConvertToRawURL(rawURL string) (string, error) {
	trimmed := strings.TrimSpace(rawURL)
	if trimmed == "" {
		return "", fmt.Errorf("empty URL provided")
	}

	if !strings.HasPrefix(trimmed, "http://") && !strings.HasPrefix(trimmed, "https://") {
		trimmed = "https://" + trimmed
	}

	parsed, err := url.Parse(trimmed)
	if err != nil {
		return "", fmt.Errorf("invalid URL format: %w", err)
	}

	host := strings.ToLower(parsed.Host)

	if host == "raw.githubusercontent.com" {
		parts := strings.Split(strings.Trim(parsed.Path, "/"), "/")
		if len(parts) < 4 {
			return "", fmt.Errorf("invalid raw GitHub URL path structure: %s", rawURL)
		}
		return parsed.String(), nil
	}

	if host == "github.com" || host == "www.github.com" {
		parts := strings.Split(strings.Trim(parsed.Path, "/"), "/")
		// Expected path format: owner/repo/blob/ref/filepath...
		// or: owner/repo/raw/ref/filepath...
		if len(parts) >= 4 && (parts[2] == "blob" || parts[2] == "raw") {
			owner := parts[0]
			repo := parts[1]
			ref := parts[3]
			filePath := strings.Join(parts[4:], "/")

			if filePath == "" {
				return "", fmt.Errorf("GitHub URL must point to a specific file: %s", rawURL)
			}

			rawPath := fmt.Sprintf("/%s/%s/%s/%s", owner, repo, ref, filePath)
			return "https://raw.githubusercontent.com" + rawPath, nil
		}
		return "", fmt.Errorf("unsupported GitHub URL format (must be a file blob/raw link): %s", rawURL)
	}

	return "", fmt.Errorf("domain %s is not a recognized GitHub host", parsed.Host)
}

// FetchSkillFromURL converts the provided GitHub URL to a raw URL, fetches the markdown file,
// parses skill metadata (name, description, tags, slug), and constructs a models.Skill object.
func (s *GitHubService) FetchSkillFromURL(skillURL string) (*models.Skill, error) {
	rawURL, err := s.ConvertToRawURL(skillURL)
	if err != nil {
		return nil, fmt.Errorf("failed to convert URL: %w", err)
	}

	resp, err := s.client.Get(rawURL)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch content from %s: %w", rawURL, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("failed to fetch skill content: HTTP status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	content := string(body)
	if strings.TrimSpace(content) == "" {
		return nil, fmt.Errorf("fetched skill content is empty")
	}

	skill := extractSkillMetadata(content, skillURL)
	return skill, nil
}

// extractSkillMetadata parses frontmatter and markdown body to populate Skill struct fields.
func extractSkillMetadata(content, originalURL string) *models.Skill {
	var name, description, tags string
	lines := strings.Split(content, "\n")
	trimmedContent := strings.TrimSpace(content)

	// Attempt frontmatter extraction
	if strings.HasPrefix(trimmedContent, "---") {
		fmEnd := -1
		for i := 1; i < len(lines); i++ {
			if strings.TrimSpace(lines[i]) == "---" {
				fmEnd = i
				break
			}
		}

		if fmEnd > 0 {
			for j := 1; j < fmEnd; j++ {
				line := strings.TrimSpace(lines[j])
				if idx := strings.Index(line, ":"); idx != -1 {
					key := strings.ToLower(strings.TrimSpace(line[:idx]))
					val := strings.TrimSpace(line[idx+1:])
					val = strings.Trim(val, `"'`)

					switch key {
					case "name", "title":
						if name == "" {
							name = val
						}
					case "description", "desc", "summary":
						if description == "" {
							description = val
						}
					case "tags", "tag":
						if tags == "" {
							tags = val
						}
					}
				}
			}
		}
	}

	// Fallback for Name: look for first H1 `# Title`
	if name == "" {
		for _, line := range lines {
			trimmedLine := strings.TrimSpace(line)
			if strings.HasPrefix(trimmedLine, "# ") {
				name = strings.TrimSpace(strings.TrimPrefix(trimmedLine, "# "))
				break
			}
		}
	}

	// Fallback for Name: infer from URL path
	if name == "" {
		if parsed, err := url.Parse(originalURL); err == nil && parsed.Path != "" {
			cleanPath := strings.TrimSuffix(parsed.Path, "/")
			base := path.Base(cleanPath)
			if strings.EqualFold(base, "SKILL.md") || strings.EqualFold(base, "README.md") {
				parent := path.Base(path.Dir(cleanPath))
				if parent != "" && parent != "." && parent != "/" {
					name = parent
				}
			} else if base != "" && base != "." {
				name = strings.TrimSuffix(base, path.Ext(base))
			}
		}
		if name == "" {
			name = "Imported Skill"
		}
	}

	// Fallback for Description: first non-header, non-empty text paragraph
	if description == "" {
		for _, line := range lines {
			trimmedLine := strings.TrimSpace(line)
			if trimmedLine == "" || strings.HasPrefix(trimmedLine, "---") ||
				strings.HasPrefix(trimmedLine, "#") || strings.HasPrefix(trimmedLine, "```") ||
				strings.HasPrefix(trimmedLine, ">") {
				continue
			}
			description = trimmedLine
			break
		}
	}

	skill := &models.Skill{
		Name:        name,
		Description: description,
		Content:     content,
		Tags:        tags,
		SourceType:  "github",
		SourceURL:   originalURL,
	}
	skill.GenerateSlug()

	return skill
}
