# Clean Navigation & Overview Page Specification - SkillCraft

## Overview
Spesifikasi ini menyederhanakan halaman utama (`/`) menjadi **Clean Overview Dashboard** dan memindahkan seluruh daftar skill ke halaman khusus **Skills Library (`/skills`)**, serta memperbaiki navigasi sidebar agar 100% fungsional dan responsif.

---

## 1. Page & Route Structure

### 1. `/` (Overview Dashboard)
- **Primary Focus**: Ringkasan sistem dan status agent sync.
- **Components**:
  - Stats Summary Bar (Total Skills, Active Targets, Sync Engine Status).
  - Quick Action Card (Tombol cepat Import GitHub & Create Custom Skill).
  - Recent Agent Target List (Daftar lokasi target agent beserta status sync-nya).
  - **No large skill grid list** on Home.

### 2. `/skills` (Skills Library)
- **Primary Focus**: Pencarian, pemfilteran, dan manajemen lengkap skill.
- **Components**:
  - Live Search Input.
  - Source Filter Pills (*All*, *Custom*, *GitHub*).
  - Full Responsive Skill Cards Grid with Edit & Delete actions.

### 3. `/targets` (Agent Targets Manager)
- **Primary Focus**: Pengaturan lokasi target agent lokal & global.

---

## 2. Sidebar Navigation Updates (`web/templates/partials/sidebar.html`)

- Menu Navigasi:
  - 📊 **Overview** -> `href="/"`
  - ⚡ **Skills Library** -> `href="/skills"`
  - 🎯 **Agent Targets** -> `href="/targets"`
- Fix Alpine.js & HTMX event handlers agar toggle mobile drawer dan desktop collapse berjalan tanpa kendala.

---

## 3. Verification Plan
- Verify GET `/` renders Clean Overview Dashboard.
- Verify GET `/skills` renders complete Skills Library grid with search/filters.
- Verify Sidebar links navigate smoothly and highlight active page state.
