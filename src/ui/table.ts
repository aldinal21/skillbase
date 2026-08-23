export function renderTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)));
  const fmt = (cells: string[]) => cells.map((c, i) => (c ?? '').padEnd(widths[i]!)).join('  ');
  const bar = '-'.repeat(widths.reduce((a, b) => a + b, 0) + 2 * (headers.length - 1));
  return [fmt(headers), bar, ...rows.map(fmt)].join('\n');
}
