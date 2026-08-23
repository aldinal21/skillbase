import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AppConfig, TargetConfig } from '../types.js';

export interface AgentPreset {
  key: string;
  name: string;
  globalPath: string;
}

export const AGENT_PRESETS: AgentPreset[] = [
  { key: 'agents', name: 'Universal (.agents)', globalPath: '~/.agents/skills' },
  { key: 'claude-code', name: 'Claude Code', globalPath: '~/.claude/skills' },
  { key: 'opencode', name: 'OpenCode', globalPath: '~/.config/opencode/skills' },
  { key: 'codex', name: 'Codex', globalPath: '~/.codex/skills' },
  { key: 'cursor', name: 'Cursor', globalPath: '~/.cursor/skills' },
  { key: 'windsurf', name: 'Windsurf', globalPath: '~/.codeium/windsurf/skills' },
  { key: 'gemini-cli', name: 'Gemini CLI', globalPath: '~/.gemini/skills' },
  { key: 'github-copilot', name: 'GitHub Copilot', globalPath: '~/.copilot/skills' },
  { key: 'antigravity-cli', name: 'Antigravity CLI', globalPath: '~/.gemini/antigravity-cli/skills' },
  { key: 'cline', name: 'Cline', globalPath: '~/.agents/skills' },
  { key: 'droid', name: 'Droid (Factory)', globalPath: '~/.factory/skills' },
  { key: 'roo', name: 'Roo Code', globalPath: '~/.roo/skills' },
  { key: 'crush', name: 'Crush', globalPath: '~/.config/crush/skills' },
  { key: 'qwen-code', name: 'Qwen Code', globalPath: '~/.qwen/skills' },
];

export async function detectInstalledPresetsIn(home: string): Promise<AgentPreset[]> {
  const found: AgentPreset[] = [];
  for (const p of AGENT_PRESETS) {
    const resolved = p.globalPath.startsWith('~') ? home + p.globalPath.slice(1) : p.globalPath;
    try {
      if ((await fs.stat(resolved)).isDirectory()) found.push(p);
    } catch {
      /* not installed */
    }
  }
  return found;
}

export function detectInstalledPresets(): Promise<AgentPreset[]> {
  return detectInstalledPresetsIn(os.homedir());
}

export function presetToTarget(p: AgentPreset): TargetConfig {
  return { id: `${p.key}-global`, name: p.name, path: p.globalPath, type: p.key, active: true };
}

export function addTargetById(cfg: AppConfig, p: AgentPreset): AppConfig {
  if (cfg.targets.some((t) => t.id === `${p.key}-global`)) return cfg;
  return { ...cfg, targets: [...cfg.targets, presetToTarget(p)] };
}

export function addCustomTarget(cfg: AppConfig, name: string, rawPath: string): AppConfig {
  const base =
    path.posix.basename(rawPath.replace(/\\/g, '/')).replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'target';
  const id = `${base}-custom`;
  if (cfg.targets.some((t) => t.id === id)) return cfg;
  return { ...cfg, targets: [...cfg.targets, { id, name, path: rawPath, type: 'custom', active: true }] };
}

export function removeTargetById(cfg: AppConfig, id: string): AppConfig {
  return { ...cfg, targets: cfg.targets.filter((t) => t.id !== id) };
}

export function toggleTargetById(cfg: AppConfig, id: string): AppConfig {
  return { ...cfg, targets: cfg.targets.map((t) => (t.id === id ? { ...t, active: !t.active } : t)) };
}


