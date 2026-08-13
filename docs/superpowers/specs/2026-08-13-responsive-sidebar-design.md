# Responsive Sidebar Layout Specification - SkillCraft

## Overview
Spesifikasi ini memperbarui struktur layout UI **SkillCraft** dari Top-Nav Monolith menjadi **Collapsible Responsive Sidebar Layout** yang sepenuhnya adaptif untuk berbagai ukuran layar (mobile, tablet, hingga desktop).

---

## 1. Responsive Layout Architecture

### Desktop & Tablet (≥ 768px / `md` breakpoint)
- **Fixed Sidebar**: Terletak di sisi kiri halaman web.
- **Collapsible State**:
  - **Expanded Mode** (default width: 256px / `w-64`): Menampilkan logo, nama menu, icon, dan section badge.
  - **Collapsed Mode** (width: 80px / `w-20`): Hanya menampilkan Icon menu dengan tooltip saat hover.
- **Smooth Transition**: Perubahan ukuran sidebar dan offset konten utama disesuaikan menggunakan Tailwind CSS `transition-all duration-300`.

### Mobile View (< 768px)
- **Hidden Sidebar by Default**: Sidebar tersembunyi untuk memberikan area baca layar yang maksimal.
- **Header Hamburger Button (`≡`)**: Terletak di header navigasi mobile.
- **Slide-over Drawer**: Menggunakan Alpine.js state (`sidebarOpen = true/false`) untuk menampilkan sidebar sebagai slide-over drawer dari kiri dengan backdrop overlay (`bg-black/60 backdrop-blur-sm`).

---

## 2. Sidebar Navigation Structure & Filters

1. **Header Section**:
   - SkillCraft Logo & Title
   - Desktop Collapse/Expand Toggle Button (`<<` / `>>`)
2. **Main Navigation**:
   - ⚡ **All Skills**: Displays total vault collection.
   - 🛠️ **Custom Skills**: Filter skills with `source_type = 'custom'`.
   - 📦 **GitHub Imported**: Filter skills with `source_type = 'github'`.
3. **Agent Targets Section**:
   - List registered targets (e.g. Antigravity CLI, Workspace `.agent`).
4. **Tags Section**:
   - Dynamically loaded tags for instant HTMX filtering.

---

## 3. Alpine.js State Contract

```javascript
x-data="{
    mobileSidebarOpen: false,
    desktopSidebarCollapsed: false,
    activeFilter: 'all',
    // ... modal states
}"
```

---

## 4. Verification Plan
- **Mobile View**: Test sidebar slide-over menu toggle via hamburger button (< 768px).
- **Desktop View**: Test sidebar collapse and expand animation (≥ 768px).
- **HTMX Integration**: Test clicking sidebar menu items to filter skill cards dynamically.
