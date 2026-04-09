import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppEnv } from './types';
import { configRoutes } from './routes/config';
import { sessionRoutes } from './routes/sessions';
import { chatRoutes } from './routes/chat';
import { cyclrRoutes } from './routes/cyclr';

const app = new Hono<AppEnv>();

app.use('*', cors());

app.route('/api/config', configRoutes);
app.route('/api/sessions', sessionRoutes);
app.route('/api/chat', chatRoutes);
app.route('/api/cyclr', cyclrRoutes);

app.get('/api/health', (c) => c.json({ ok: true }));

// Check Worker egress IP (for whitelisting)
app.get('/api/egress-ip', async (c) => {
  const res = await fetch('https://httpbin.org/ip');
  const data = await res.json<{ origin: string }>();
  return c.json({ worker_egress_ip: data.origin });
});

export default app;
