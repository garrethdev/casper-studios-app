import { serve } from '@hono/node-server';
import { loadDevEnv, log } from '@leanplate/platform';

loadDevEnv();

const { buildApp } = await import('./app');
const app = await buildApp();
// A service-specific name, not PORT: a shared PORT in the shell would make all three services fight for one port.
const port = Number(process.env.INTELLIGENCE_PORT ?? 4003);
serve({ fetch: app.fetch, port, hostname: process.env.HOST ?? '127.0.0.1' }, (info) => {
  log.info('intelligence listening', { port: info.port, photoAnalysis: Boolean(process.env.ANTHROPIC_API_KEY) });
});
