import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { getConfig, setConfig, maskSecrets, getConfigValue } from '../services/config';
import { testLLMConnection } from '../services/llm';

export const configRoutes = new Hono<AppEnv>();

// GET /api/config — retrieve all config (secrets masked)
configRoutes.get('/', async (c) => {
  const config = await getConfig(c.env.DB);
  return c.json(maskSecrets(config));
});

// POST /api/config — update config values
configRoutes.post('/', async (c) => {
  const body = await c.req.json<Record<string, string>>();
  if (!body || typeof body !== 'object') {
    return c.json({ error: 'Invalid request body' }, 400);
  }
  await setConfig(c.env.DB, body);
  return c.json({ ok: true });
});

// POST /api/config/test-llm — test LLM provider connection
configRoutes.post('/test-llm', async (c) => {
  const { provider, api_key } = await c.req.json<{ provider: string; api_key: string }>();
  if (!provider || !api_key) {
    return c.json({ error: 'provider and api_key are required' }, 400);
  }
  const result = await testLLMConnection(provider, api_key);
  if (!result.ok) {
    return c.json({ ok: false, error: result.error }, 401);
  }
  return c.json({ ok: true, model: result.model });
});

// POST /api/config/test-cyclr — test Cyclr API connection
configRoutes.post('/test-cyclr', async (c) => {
  const { account_id, client_id, client_secret } = await c.req.json<{
    account_id: string;
    client_id: string;
    client_secret: string;
  }>();

  if (!account_id || !client_id || !client_secret) {
    return c.json({ error: 'account_id, client_id, and client_secret are required' }, 400);
  }

  try {
    const tokenRes = await fetch('https://demoone-h.cyclr.uk/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: client_id,
        client_secret: client_secret,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      return c.json({ ok: false, error: `Cyclr auth failed: ${errText}` }, 401);
    }

    const tokenData = await tokenRes.json<{ access_token: string; expires_in: number }>();

    // Cache the token
    await setConfig(c.env.DB, {
      cyclr_bearer_token: tokenData.access_token,
      cyclr_token_expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
    });

    return c.json({ ok: true, token_expires_in: tokenData.expires_in });
  } catch (e: unknown) {
    return c.json({ ok: false, error: String(e) }, 500);
  }
});

// POST /api/config/test-mcp — test MCP server connection
configRoutes.post('/test-mcp', async (c) => {
  const { url } = await c.req.json<{ url: string }>();
  if (!url) {
    return c.json({ error: 'url is required' }, 400);
  }

  try {
    const { connectMCP } = await import('../services/mcp-client');
    const mcpClient = await connectMCP(url);
    const toolList = mcpClient.tools.map((t) => ({
      name: t.name,
      description: t.description,
    }));
    mcpClient.close();

    return c.json({
      ok: true,
      server: 'MCP Server',
      tools: toolList.length,
      toolList,
    });
  } catch (e: unknown) {
    return c.json({ ok: false, error: `Cannot reach MCP server: ${e}` }, 422);
  }
});
