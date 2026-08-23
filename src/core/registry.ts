const SEARCH_API_BASE = process.env['SKILLBASE_SEARCH_API'] ?? 'https://skills.sh/api/search';

export class RegistryError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export interface SearchResult {
  id: string;
  skillId: string;
  name: string;
  installs: number;
  source: string;
}

export async function searchSkills(
  query: string,
  limit = 20,
  fetchImpl: typeof fetch = fetch,
): Promise<SearchResult[]> {
  const url = `${SEARCH_API_BASE}?q=${encodeURIComponent(query)}&limit=${limit}`;
  const res = await fetchImpl(url, { headers: { accept: 'application/json' } });
  if (!res.ok) {
    throw new RegistryError(res.status, `skills.sh search failed: HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    skills?: Array<{ id?: string; skillId?: string; name?: string; installs?: number; source?: string }>;
  };
  return (data.skills ?? []).map((s) => ({
    id: s.id ?? '',
    skillId: s.skillId ?? '',
    name: s.name ?? '',
    installs: s.installs ?? 0,
    source: s.source ?? '',
  }));
}
