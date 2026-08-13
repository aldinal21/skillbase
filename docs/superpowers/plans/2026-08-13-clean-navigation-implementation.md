# Clean Navigation & Overview Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor SkillBase layout to render a clean, focused Overview Dashboard on `/`, move full skill management grid to `/skills`, and fix all sidebar interaction links.

**Architecture:** Create dedicated Echo routes for `/` (Overview), `/skills` (Skills Library), and `/targets` (Agent Targets). Update templates to render a lean Overview page on home and keep full skill grid operations in `/skills`. Fix Alpine.js & HTMX sidebar handlers.

**Tech Stack:** Go 1.22+, Echo v4, HTMX, Alpine.js, Tailwind CSS (v3 CDN).

## Global Constraints

- **Route Structure**:
  - `GET /`: Overview Dashboard (Stats + Quick Actions + Target Summary, NO heavy grid list).
  - `GET /skills`: Full Skills Library page.
  - `GET /targets`: Agent Targets page.
- **Sidebar**: Update sidebar links and ensure mobile drawer toggle & desktop collapse work flawlessly.

---

## Task 1: Refactor Router, Handlers & Separate HTML Views

**Files:**
- Create: `web/templates/pages/overview.html`
- Create: `web/templates/pages/skills.html`
- Modify: `internal/handlers/dashboard_handler.go`
- Modify: `web/templates/partials/sidebar.html`
- Modify: `main.go`
- Test: `internal/handlers/dashboard_handler_test.go`

**Interfaces:**
- Consumes: Echo router & Handlers
- Produces: Clean `/` Overview page and separate `/skills` Library page.

- [ ] **Step 1: Create Overview Page Template (`web/templates/pages/overview.html`)**

Write `web/templates/pages/overview.html`:
```html
{{define "content"}}
<div class="space-y-8">
    <!-- Header Title -->
    <div>
        <h2 class="text-2xl font-bold text-slate-100">Overview Dashboard</h2>
        <p class="text-sm text-slate-400">Welcome to SkillBase. Manage and sync your AI Agent skills universally.</p>
    </div>

    <!-- Quick Action Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="bg-gradient-to-br from-indigo-900/40 to-slate-900 border border-indigo-500/30 rounded-2xl p-6 shadow-xl flex items-center justify-between">
            <div>
                <h3 class="text-lg font-bold text-indigo-200">Import from GitHub</h3>
                <p class="text-xs text-slate-400 mt-1 max-w-sm">Automatically fetch and import SKILL.md prompts directly from any public GitHub repository.</p>
                <button type="button" @click="$dispatch('open-import-modal')" class="mt-4 inline-flex items-center px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 transition-all">
                    📥 Import GitHub Skill
                </button>
            </div>
            <div class="text-4xl opacity-80">📦</div>
        </div>

        <div class="bg-gradient-to-br from-purple-900/40 to-slate-900 border border-purple-500/30 rounded-2xl p-6 shadow-xl flex items-center justify-between">
            <div>
                <h3 class="text-lg font-bold text-purple-200">Create Custom Skill</h3>
                <p class="text-xs text-slate-400 mt-1 max-w-sm">Build your own agent prompts with frontmatter metadata & live Markdown preview.</p>
                <button type="button" @click="$dispatch('open-create-modal')" class="mt-4 inline-flex items-center px-4 py-2 rounded-xl text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/30 transition-all">
                    ⚡ Build Custom Skill
                </button>
            </div>
            <div class="text-4xl opacity-80">🛠️</div>
        </div>
    </div>

    <!-- Agent Targets Overview -->
    <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-md space-y-4">
        <div class="flex items-center justify-between">
            <h3 class="text-lg font-bold text-slate-200">Configured Agent Targets</h3>
            <a href="/skills" class="text-xs font-medium text-indigo-400 hover:text-indigo-300">View Skills Library &rarr;</a>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {{range .Targets}}
            <div class="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center space-x-3">
                <div class="w-3 h-3 rounded-full bg-emerald-400 shadow-md shadow-emerald-500/40"></div>
                <div>
                    <p class="text-sm font-semibold text-slate-200">{{.Name}}</p>
                    <p class="text-xs text-slate-400 truncate max-w-xs">{{.Path}}</p>
                </div>
            </div>
            {{else}}
            <p class="text-sm text-slate-500 italic col-span-full">No active targets configured.</p>
            {{end}}
        </div>
    </div>
</div>
{{end}}
```

- [ ] **Step 2: Update Handlers & Routes in Echo**

Update `internal/handlers/dashboard_handler.go` to separate `RenderOverview` and `RenderSkillsLibrary`.

- [ ] **Step 3: Update Sidebar Navigation HTML (`web/templates/partials/sidebar.html`)**

Update link hrefs and Alpine.js active state markers.

- [ ] **Step 4: Verify all tests pass**

Run: `go test ./...`
Expected: PASS

- [ ] **Step 5: Commit changes**

```bash
git add web/ internal/handlers/ main.go
git commit -m "feat: implement clean overview dashboard on home and separate skills library page"
```

---

## Self-Review Checklist
1. **Spec Coverage**: `/` is clean overview, `/skills` is skills library grid.
2. **Placeholder Scan**: No placeholders or TODOs.
3. **Type Consistency**: Echo handlers and renderer signature match.

---

Plan complete and saved to `docs/superpowers/plans/2026-08-13-clean-navigation-implementation.md`.
