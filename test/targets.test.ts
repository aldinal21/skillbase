import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { AGENT_PRESETS, detectInstalledPresetsIn, presetToTarget } from '../src/core/targets.js';
import { mkTmp } from './helpers.js';

describe('targets', () => {
  it('catalog includes claude-code, opencode and universal .agents', () => {
    const keys = AGENT_PRESETS.map((p) => p.key);
    expect(keys).toContain('claude-code');
    expect(keys).toContain('opencode');
    expect(keys).toContain('agents');
    const agents = AGENT_PRESETS.find((p) => p.key === 'agents')!;
    expect(agents.globalPath).toBe('~/.agents/skills');
  });

  it('presetToTarget shape', () => {
    const t = presetToTarget({ key: 'claude-code', name: 'Claude Code', globalPath: '~/.claude/skills' });
    expect(t.id).toBe('claude-code-global');
    expect(t.active).toBe(true);
    expect(t.path).toBe('~/.claude/skills');
  });

  it('detectInstalledPresetsIn finds existing dirs only', async () => {
    const home = await mkTmp();
    await fs.mkdir(path.join(home, '.claude', 'skills'), { recursive: true });
    const found = await detectInstalledPresetsIn(home);
    expect(found).toHaveLength(1);
    expect(found[0]!.key).toBe('claude-code');
  });
});
