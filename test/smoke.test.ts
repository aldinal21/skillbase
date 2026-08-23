import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const SKIP = process.env['SKIP_SMOKE'] === '1';

describe.skipIf(SKIP)('binary smoke', () => {
  it('prints version', async () => {
    const { stdout } = await exec('node', ['bin/skillbase.js', '--version']);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });
});
