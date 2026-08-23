import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { defaultConfig, expandHome, loadConfig, saveConfig } from '../src/core/config.js';
import { mkTmp } from './helpers.js';

describe('config', () => {
  it('returns null when missing', async () => {
    expect(await loadConfig(path.join(await mkTmp(), 'config.json'))).toBeNull();
  });

  it('saves and loads round-trip', async () => {
    const dir = await mkTmp();
    const p = path.join(dir, 'nested', 'config.json');
    const cfg = defaultConfig();
    cfg.targets.push({ id: 't1', name: 'T', path: '~/x', type: 'custom', active: true });
    await saveConfig(cfg, p);
    const loaded = await loadConfig(p);
    expect(loaded?.targets[0]?.id).toBe('t1');
    expect(loaded?.updateCheck.intervalHours).toBe(24);
  });

  it('expands ~ to home', () => {
    const home = expandHome('~');
    expect(home).not.toBe('~');
    expect(expandHome('~/a/b').startsWith(home)).toBe(true);
    expect(expandHome('~/a/b')).toContain(path.join('a', 'b'));
  });
});
