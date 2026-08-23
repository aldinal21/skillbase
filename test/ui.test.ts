import { describe, expect, it } from 'vitest';
import { renderTable } from '../src/ui/table.js';
import { formatInstalls } from '../src/ui/format.js';
import { lineDiff } from '../src/ui/diff.js';
import { createTestIo } from './helpers.js';

describe('renderTable', () => {
  it('aligns columns', () => {
    const t = renderTable(['A', 'B'], [['x', 'yy'], ['zzz', 'w']]);
    const lines = t.split('\n');
    expect(lines[0]).toContain('A');
    expect(lines[0]).toContain('B');
    expect(lines[1]).toMatch(/^-[- ]*-$/);
    expect(lines[2]).toContain('x');
  });
});

describe('formatInstalls', () => {
  it('humanizes counts', () => {
    expect(formatInstalls(0)).toBe('');
    expect(formatInstalls(746961)).toBe('747.0K installs');
    expect(formatInstalls(2453100)).toBe('2.5M installs');
  });
});

describe('lineDiff', () => {
  it('reports removed and added lines', () => {
    const d = lineDiff('a\nb\nc', 'a\nX\nc');
    expect(d.removed).toEqual(['b']);
    expect(d.added).toEqual(['X']);
  });

  it('caps output length', () => {
    const big = Array.from({ length: 500 }, (_, i) => `line${i}`).join('\n');
    const d = lineDiff('', big, 10);
    expect(d.added.length).toBeLessThanOrEqual(10);
  });
});

describe('createTestIo', () => {
  it('scripts answers and captures output', async () => {
    const { io, out } = createTestIo({ texts: ['hello'], confirms: [true], selects: ['a'], multis: [['x']] });
    expect(await io.text({ message: 'q' })).toBe('hello');
    expect(await io.confirm({ message: 'c' })).toBe(true);
    expect(await io.select({ message: 's', options: [{ value: 'a', label: 'A' }] })).toBe('a');
    expect(await io.multiselect({ message: 'm', options: [{ value: 'x', label: 'X' }] })).toEqual(['x']);
    io.info('logged');
    expect(out.join('\n')).toContain('logged');
  });
});
