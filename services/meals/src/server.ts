import { serve } from '@hono/node-server';
import { loadDevEnv, log } from '@leanplate/platform';

loadDevEnv();
const { buildApp } = await import('./app');
const app = await buildApp();
// A service-specific name, not PORT: a shared PORT in the shell would make all three services fight for one port.
const port = Number(process.env.MEALS_PORT ?? 4002);
serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, () => log.info('meals listening', { port }));
