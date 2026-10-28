import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { requestId } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';
import { ZodError, type ZodType, type output } from 'zod';
import { AppError, type AuthEnv } from '@leanplate/security';
import { log } from './logger';

/**
 * The common shell for every service: request ids, hardened response headers,
 * a body size cap, uniform error output that never leaks internals, and logging.
 */
export function createApp(service: string, opts: { maxBodyBytes?: number } = {}) {
  const app = new Hono<AuthEnv>();

  app.use('*', requestId());
  app.use(
    '*',
    secureHeaders({
      contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      strictTransportSecurity: 'max-age=63072000; includeSubDomains',
      xFrameOptions: 'DENY',
      referrerPolicy: 'no-referrer',
      crossOriginResourcePolicy: 'same-origin',
      permissionsPolicy: { camera: [], microphone: [], geolocation: [] },
    }),
  );
  app.use('*', bodyLimit({
    maxSize: opts.maxBodyBytes ?? 4 * 1024 * 1024,
    onError: (c) => c.json({ error: { code: 'payload_too_large', message: 'Request body is too large' } }, 413),
  }));
  app.use('*', async (c, next) => {
    const start = Date.now();
    c.header('Cache-Control', 'no-store');
    await next();
    log.info('request', { service, method: c.req.method, path: c.req.path, status: c.res.status, ms: Date.now() - start, requestId: c.get('requestId') });
  });

  app.get('/health', (c) => c.json({ ok: true, service }));

  app.notFound((c) => c.json({ error: { code: 'not_found', message: 'Not found', requestId: c.get('requestId') } }, 404));
  app.onError((err, c) => {
    const rid = c.get('requestId');
    if (err instanceof AppError) {
      for (const [k, v] of Object.entries(err.headers ?? {})) c.header(k, v);
      return c.json({ error: { code: err.code, message: err.message, requestId: rid } }, err.status as 400);
    }
    if (err instanceof ZodError) {
      const message = err.issues.slice(0, 3).map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
      return c.json({ error: { code: 'invalid_request', message, requestId: rid } }, 400);
    }
    log.error('unhandled', { service, requestId: rid, message: (err as Error).message, stack: (err as Error).stack });
    return c.json({ error: { code: 'internal', message: 'Something went wrong', requestId: rid } }, 500);
  });

  return app;
}

/** Reads and validates a JSON body in one step. Unknown fields are rejected by the schemas' strict() mode. */
export async function parseBody<S extends ZodType>(c: { req: { json: () => Promise<unknown> } }, schema: S): Promise<output<S>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new AppError(400, 'invalid_json', 'Request body must be valid JSON');
  }
  return schema.parse(raw);
}
