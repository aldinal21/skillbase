import { describe, expect, it } from 'vitest';
import { RegistryError, searchSkills } from '../src/core/registry.js';

describe('searchSkills', () => {
  it('maps API response fields and encodes query', async () => {
    let calledUrl = '';
    const results = await searchSkills('tdd', 3, (async (url: any) => {
      calledUrl = String(url);
      return new Response(
        JSON.stringify({
          skills: [{ id: 'o/r/tdd', skillId: 'tdd', name: 'tdd', installs: 100, source: 'o/r' }],
        }),
        { status: 200 },
      );
    }) as typeof fetch);
    expect(calledUrl).toContain('q=tdd');
    expect(calledUrl).toContain('limit=3');
    expect(results[0]).toMatchObject({ id: 'o/r/tdd', installs: 100, source: 'o/r' });
  });

  it('throws RegistryError with status on failure', async () => {
    const fail = (async () => new Response(JSON.stringify({}), { status: 401 })) as typeof fetch;
    await expect(searchSkills('x', 20, fail)).rejects.toThrow(RegistryError);
    await expect(searchSkills('x', 20, fail)).rejects.toMatchObject({ status: 401 });
  });
});
