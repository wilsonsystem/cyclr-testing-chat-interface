import { Hono } from 'hono';
import type { AppEnv, ChatSession, Message } from '../types';
import { getSessionUsage } from '../services/usage-logger';

export const sessionRoutes = new Hono<AppEnv>();

// POST /api/sessions — create a new chat session
sessionRoutes.post('/', async (c) => {
  const { mode } = await c.req.json<{ mode?: string }>();
  const sessionMode = mode ?? 'mcp';
  const id = crypto.randomUUID();

  await c.env.DB
    .prepare(
      `INSERT INTO chat_sessions (id, mode, llm_provider, created_at, updated_at)
       VALUES (?, ?, '', datetime('now'), datetime('now'))`
    )
    .bind(id, sessionMode)
    .run();

  return c.json({ id, mode: sessionMode, created_at: new Date().toISOString() }, 201);
});

// GET /api/sessions/:id — get session with messages and usage
sessionRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');

  const session = await c.env.DB
    .prepare('SELECT * FROM chat_sessions WHERE id = ?')
    .bind(id)
    .first<ChatSession>();

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const { results: messages } = await c.env.DB
    .prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY sequence')
    .bind(id)
    .all<Message>();

  const usage = await getSessionUsage(c.env.DB, id);

  return c.json({ ...session, messages, usage });
});

// GET /api/sessions — list all sessions with usage summary
sessionRoutes.get('/', async (c) => {
  const { results } = await c.env.DB
    .prepare(
      `SELECT
         s.id, s.mode, s.llm_provider, s.created_at, s.is_active,
         COUNT(m.id) as message_count,
         COALESCE(SUM(u.input_tokens), 0) as total_input_tokens,
         COALESCE(SUM(u.output_tokens), 0) as total_output_tokens,
         COALESCE(SUM(u.estimated_cost_usd), 0) as total_cost_usd,
         MAX(u.model_name) as model_name
       FROM chat_sessions s
       LEFT JOIN messages m ON m.session_id = s.id
       LEFT JOIN usage_logs u ON u.session_id = s.id
       GROUP BY s.id
       ORDER BY s.created_at DESC`
    )
    .all();

  return c.json({ sessions: results });
});

// DELETE /api/sessions/:id — clear/reset a session
sessionRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');

  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM usage_logs WHERE session_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM messages WHERE session_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM chat_sessions WHERE id = ?').bind(id),
  ]);

  return c.json({ ok: true });
});
