import { describe, expect, it } from 'vitest';
import { addCustomTarget, addTargetById, removeTargetById, toggleTargetById } from '../src/core/targets.js';
import type { AppConfig } from '../src/types.js';

const cfg = (): AppConfig => ({
  version: 1,
  vaultPath: '~/.skillbase/vault',
  targets: [],
  updateCheck: { intervalHours: 24, lastCheck: null },
});

describe('target CRUD helpers', () => {
  it('adds preset target deterministically', () => {
    const c = addTargetById(cfg(), { key: 'claude-code', name: 'Claude Code', globalPath: '~/.claude/skills' });
    expect(c.targets[0]!.id).toBe('claude-code-global');
  });

  it('ignores duplicate preset adds', () => {
    let c = addTargetById(cfg(), { key: 'claude-code', name: 'Claude Code', globalPath: '~/.claude/skills' });
    c = addTargetById(c, { key: 'claude-code', name: 'Claude Code', globalPath: '~/.claude/skills' });
    expect(c.targets).toHaveLength(1);
  });

  it('adds custom target with slugified id', () => {
    const c = addCustomTarget(cfg(), 'My Project', '/home/u/proj/.agent/skills');
    expect(c.targets[0]!.id).toBe('skills-custom');
    expect(c.targets[0]!.type).toBe('custom');
  });

  it('removes and toggles', () => {
    let c = addTargetById(cfg(), { key: 'opencode', name: 'OpenCode', globalPath: '~/.config/opencode/skills' });
    c = toggleTargetById(c, 'opencode-global');
    expect(c.targets[0]!.active).toBe(false);
    c = removeTargetById(c, 'opencode-global');
    expect(c.targets).toHaveLength(0);
  });
});
