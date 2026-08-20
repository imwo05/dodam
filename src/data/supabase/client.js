const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
  Accept: 'application/json'
};

export function createSupabaseRestClient({ url, serviceRoleKey, fetchImpl = fetch }) {
  if (!url || !serviceRoleKey) {
    throw new Error('Supabase persistence requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }

  const restUrl = `${String(url).replace(/\/$/, '')}/rest/v1`;

  return {
    async select(table, query = {}) {
      return request(table, { method: 'GET', query: { select: '*', ...query } });
    },
    async insert(table, row, { upsert = false } = {}) {
      return request(table, {
        method: 'POST',
        body: row,
        headers: upsert
          ? { Prefer: 'resolution=merge-duplicates,return=representation' }
          : { Prefer: 'return=representation' }
      });
    },
    async update(table, query, patch) {
      return request(table, {
        method: 'PATCH',
        query,
        body: patch,
        headers: { Prefer: 'return=representation' }
      });
    },
    async upsert(table, row, onConflict) {
      return request(table, {
        method: 'POST',
        query: onConflict ? { on_conflict: onConflict } : {},
        body: row,
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' }
      });
    }
  };

  async function request(table, { method, query = {}, body, headers = {} }) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) search.set(key, String(value));
    }
    const target = `${restUrl}/${encodeURIComponent(table)}${search.toString() ? `?${search}` : ''}`;
    const response = await fetchImpl(target, {
      method,
      headers: {
        ...DEFAULT_HEADERS,
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        ...headers
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });

    const text = await response.text();
    let payload = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }
    if (!response.ok) {
      const detail = typeof payload === 'string' ? payload : payload?.message ?? payload?.hint ?? response.statusText;
      throw new Error(`Supabase ${method} ${table} failed (${response.status}): ${detail}`);
    }
    return Array.isArray(payload) ? payload : payload == null ? [] : [payload];
  }
}
