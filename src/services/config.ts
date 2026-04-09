const SECRET_KEYS = new Set([
  'llm_api_key',
  'cyclr_client_id',
  'cyclr_client_secret',
  'cyclr_bearer_token',
]);

export async function getConfig(db: D1Database): Promise<Record<string, string>> {
  const { results } = await db.prepare('SELECT key, value FROM config').all<{ key: string; value: string }>();
  const config: Record<string, string> = {};
  for (const row of results) {
    config[row.key] = row.value;
  }
  return config;
}

export async function getConfigValue(db: D1Database, key: string): Promise<string | null> {
  const row = await db.prepare('SELECT value FROM config WHERE key = ?').bind(key).first<{ value: string }>();
  return row?.value ?? null;
}

export async function setConfig(db: D1Database, entries: Record<string, string>): Promise<void> {
  const stmt = db.prepare(
    `INSERT INTO config (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  );
  const batch = Object.entries(entries).map(([key, value]) => stmt.bind(key, value));
  if (batch.length > 0) {
    await db.batch(batch);
  }
}

/** Extract mode-specific config (mode_a_* or mode_b_*) into unprefixed keys */
export function getModeConfig(config: Record<string, string>, mode: 'a' | 'b'): Record<string, string> {
  const prefix = `mode_${mode}_`;
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(config)) {
    if (key.startsWith(prefix)) {
      result[key.slice(prefix.length)] = value;
    }
  }
  return result;
}

export function maskSecrets(config: Record<string, string>): Record<string, string> {
  const masked: Record<string, string> = {};
  for (const [key, value] of Object.entries(config)) {
    if (SECRET_KEYS.has(key) && value.length > 8) {
      masked[key] = value.slice(0, 4) + '***' + value.slice(-4);
    } else {
      masked[key] = value;
    }
  }
  return masked;
}
