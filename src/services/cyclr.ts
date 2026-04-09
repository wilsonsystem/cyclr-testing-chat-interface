import { setConfig } from './config';

export interface CyclrConfig {
  accountId: string;
  clientId: string;
  clientSecret: string;
  connectorId: string;
  bearerToken?: string;
  tokenExpiresAt?: string;
}

async function getToken(config: CyclrConfig, db?: D1Database): Promise<string> {
  // Check if cached token is still valid
  if (config.bearerToken && config.tokenExpiresAt) {
    const expiresAt = new Date(config.tokenExpiresAt);
    if (expiresAt > new Date()) {
      return config.bearerToken;
    }
  }

  // Generate new token
  const res = await fetch('https://demoone-h.cyclr.uk/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  });

  if (!res.ok) {
    throw new Error(`Cyclr auth failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json<{ access_token: string; expires_in: number }>();
  config.bearerToken = data.access_token;
  config.tokenExpiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

  // Cache token in DB
  if (db) {
    await setConfig(db, {
      cyclr_bearer_token: data.access_token,
      cyclr_token_expires_at: config.tokenExpiresAt,
    });
  }

  return data.access_token;
}

export async function callCyclrMethod(
  config: CyclrConfig,
  methodId: number,
  body?: Record<string, unknown>,
  db?: D1Database
): Promise<unknown> {
  let token = await getToken(config, db);

  const makeRequest = async (authToken: string) => {
    const url = `https://api.cyclr.uk/v1.0/account/connectors/${config.connectorId}/methods/${methodId}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${authToken}`,
      'X-Cyclr-Account': config.accountId,
      'content-type': 'application/json',
    };

    const options: RequestInit = { method: body ? 'POST' : 'GET', headers };
    if (body) options.body = JSON.stringify(body);

    return fetch(url, options);
  };

  let res = await makeRequest(token);

  // Auto-refresh on 401
  if (res.status === 401) {
    config.bearerToken = undefined;
    token = await getToken(config, db);
    res = await makeRequest(token);
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Cyclr API error ${res.status}: ${errText}`);
  }

  return res.json();
}
