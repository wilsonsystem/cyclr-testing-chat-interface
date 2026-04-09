import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { getConfig } from '../services/config';
import { callCyclrMethod, type CyclrConfig } from '../services/cyclr';
import { QUICKBOOKS_METHODS, QUICKBOOKS_CATEGORIES } from '../data/quickbooks-methods';

export const cyclrRoutes = new Hono<AppEnv>();

// GET /api/cyclr/methods — list all available QuickBooks methods
cyclrRoutes.get('/methods', (c) => {
  return c.json({
    connector_id: 88534,
    total_methods: QUICKBOOKS_METHODS.length,
    categories: Object.keys(QUICKBOOKS_CATEGORIES),
    methods: QUICKBOOKS_METHODS.map((m) => ({
      id: m.id,
      name: m.name,
      category: m.category,
      type: m.methodType,
    })),
  });
});

// POST /api/cyclr/method/:methodId — call a Cyclr connector method
cyclrRoutes.post('/method/:methodId', async (c) => {
  const methodId = parseInt(c.req.param('methodId'), 10);
  if (isNaN(methodId)) {
    return c.json({ error: 'Invalid method ID' }, 400);
  }

  const config = await getConfig(c.env.DB);
  const cyclrConfig: CyclrConfig = {
    accountId: config.cyclr_account_id,
    clientId: config.cyclr_client_id,
    clientSecret: config.cyclr_client_secret,
    connectorId: config.cyclr_connector_id || '88534',
    bearerToken: config.cyclr_bearer_token,
    tokenExpiresAt: config.cyclr_token_expires_at,
  };

  if (!cyclrConfig.accountId || !cyclrConfig.clientId || !cyclrConfig.clientSecret) {
    return c.json({ error: 'Cyclr credentials not configured' }, 422);
  }

  try {
    let body: Record<string, unknown> | undefined;
    const contentType = c.req.header('content-type');
    if (contentType?.includes('application/json')) {
      const rawBody = await c.req.text();
      if (rawBody.trim()) {
        body = JSON.parse(rawBody);
      }
    }

    const result = await callCyclrMethod(cyclrConfig, methodId, body, c.env.DB);
    return c.json(result);
  } catch (e: unknown) {
    return c.json({ error: String(e) }, 500);
  }
});
