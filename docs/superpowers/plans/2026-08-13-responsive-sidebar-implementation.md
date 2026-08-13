# Responsive Sidebar Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform SkillBase UI into a fully responsive, professional Collapsible Sidebar Layout for desktop and mobile drawer layout for smaller screens.

**Architecture:** Update `web/templates/layouts/base.html` to introduce Alpine.js controlled sidebar states (`mobileSidebarOpen`, `desktopSidebarCollapsed`). Add reusable sidebar partials and update Echo Handlers in `internal/handlers/dashboard_handler.go` to support source filtering (`custom` vs `github`).

**Tech Stack:** Go 1.22+, Echo v4, HTMX, Alpine.js, Tailwind CSS (v3 CDN).

## Global Constraints

- **Responsive Breakpoint**: `md` (768px). Desktop uses fixed/collapsible sidebar; Mobile uses slide-over drawer with backdrop blur.
- **State Management**: Client-side state managed via Alpine.js (`mobileSidebarOpen`, `desktopSidebarCollapsed`).
- **HTMX Integration**: Filter buttons in sidebar update `#skill-grid-container` without page reload.

---

## Task 1: Create Sidebar Partial & Update Base Template Layout

**Files:**
- Create: `web/templates/partials/sidebar.html`
- Modify: `web/templates/layouts/base.html`
- Modify: `internal/handlers/dashboard_handler.go`
- Test: `internal/handlers/dashboard_handler_test.go`

**Interfaces:**
- Consumes: Echo `RenderDashboard`, `SearchSkills`
- Produces: Responsive sidebar UI layout with desktop collapse and mobile drawer toggle.

- [ ] **Step 1: Create Sidebar Partial Template**

Write `web/templates/partials/sidebar.html`:
```html
{{define "sidebar.html"}}
<!-- Mobile Drawer Backdrop -->
<div x-show="mobileSidebarOpen" 
     x-transition:enter="transition-opacity ease-linear duration-300"
     x-transition:enter-start="opacity-0"
     x-transition:enter-end="opacity-100"
     x-transition:leave="transition-opacity ease-linear duration-300"
     x-transition:leave-start="opacity-100"
     x-transition:leave-end="opacity-0"
     @click="mobileSidebarOpen = false"
     class="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
     x-cloak></div>

<!-- Sidebar Container -->
<aside class="fixed top-0 bottom-0 left-0 z-50 bg-slate-900 border-r border-slate-800/80 flex flex-col transition-all duration-300 ease-in-out shadow-xl md:shadow-none"
       :class="{
           'translate-x-0': mobileSidebarOpen,
           '-translate-x-full md:translate-x-0': !mobileSidebarOpen,
           'w-64': !desktopSidebarCollapsed,
           'w-64 md:w-20': desktopSidebarCollapsed
       }">
    
    <!-- Sidebar Header / Logo -->
    <div class="h-16 border-b border-slate-800/80 px-4 flex items-center justify-between">
        <div class="flex items-center space-x-3 overflow-hidden">
            <div class="w-9 h-9 shrink-0 rounded-lg bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                </svg>
            </div>
            <div x-show="!desktopSidebarCollapsed" class="transition-opacity duration-200">
                <h1 class="text-base font-bold bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent truncate">SkillBase</h1>
                <p class="text-[10px] text-slate-400 font-medium truncate">Agent Skill Manager</p>
            </div>
        </div>

        <!-- Desktop Collapse Toggle Button -->
        <button type="button" 
                @click="desktopSidebarCollapsed = !desktopSidebarCollapsed"
                class="hidden md:flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
            <svg class="w-4 h-4 transition-transform duration-300" :class="{ 'rotate-180': desktopSidebarCollapsed }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"/>
            </svg>
        </button>

        <!-- Mobile Close Button -->
        <button type="button" 
                @click="mobileSidebarOpen = false"
                class="md:hidden flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
        </button>
    </div>

    <!-- Sidebar Navigation Body -->
    <div class="flex-1 overflow-y-auto px-3 py-4 space-y-6 scrollbar-thin scrollbar-thumb-slate-800">
        <!-- Main Navigation Links -->
        <div class="space-y-1">
            <p x-show="!desktopSidebarCollapsed" class="px-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Vault Skills</p>
            
            <!-- All Skills Filter -->
            <button hx-get="/skills/search" 
                    hx-target="#skill-grid-container" 
                    hx-swap="outerHTML"
                    @click="activeFilter = 'all'; if (window.innerWidth < 768) mobileSidebarOpen = false"
                    :class="activeFilter === 'all' ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/30' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'"
                    class="w-full flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-all group">
                <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
                </svg>
                <span x-show="!desktopSidebarCollapsed" class="ml-3 truncate">All Vault Skills</span>
            </button>

            <!-- Custom Created Skills Filter -->
            <button hx-get="/skills/search?source=custom" 
                    hx-target="#skill-grid-container" 
                    hx-swap="outerHTML"
                    @click="activeFilter = 'custom'; if (window.innerWidth < 768) mobileSidebarOpen = false"
                    :class="activeFilter === 'custom' ? 'bg-blue-600/10 text-blue-400 border border-blue-500/30' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'"
                    class="w-full flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-all group">
                <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                </svg>
                <span x-show="!desktopSidebarCollapsed" class="ml-3 truncate">Custom Created</span>
            </button>

            <!-- GitHub Imported Skills Filter -->
            <button hx-get="/skills/search?source=github" 
                    hx-target="#skill-grid-container" 
                    hx-swap="outerHTML"
                    @click="activeFilter = 'github'; if (window.innerWidth < 768) mobileSidebarOpen = false"
                    :class="activeFilter === 'github' ? 'bg-purple-600/10 text-purple-400 border border-purple-500/30' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'"
                    class="w-full flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-all group">
                <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                </svg>
                <span x-show="!desktopSidebarCollapsed" class="ml-3 truncate">GitHub Imported</span>
            </button>
        </div>
    </div>
</aside>
{{end}}
```

- [ ] **Step 2: Update Base Template to Include Sidebar & Responsive Padding**

Modify `web/templates/layouts/base.html` to integrate the sidebar and top navigation hamburger button.

- [ ] **Step 3: Update SearchSkills handler to support `source` query param**

Modify `internal/handlers/dashboard_handler.go`:
```go
func (h *Handler) SearchSkills(c echo.Context) error {
	query := c.QueryParam("q")
	sourceType := c.QueryParam("source")
	skills, _ := h.skillRepo.GetAllFiltered(query, sourceType)
	return c.Render(http.StatusOK, "skill_list.html", map[string]interface{}{
		"Skills": skills,
	})
}
```

- [ ] **Step 4: Run test suite to verify tests pass**

Run: `go test ./...`
Expected: PASS

- [ ] **Step 5: Commit changes**

```bash
git add web/ internal/handlers/
git commit -m "feat: add responsive collapsible sidebar layout and HTMX filter options"
```

---

## Self-Review Checklist
1. **Spec Coverage**: Meets all responsive sidebar requirements for desktop (collapsible) and mobile (slide-over drawer).
2. **Placeholder Scan**: No placeholders or TODOs.
3. **Type Consistency**: Method signatures and HTTP routes match Echo handlers.

---

Plan complete and saved to `docs/superpowers/plans/2026-08-13-responsive-sidebar-implementation.md`.
