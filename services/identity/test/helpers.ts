import { generateKeyPairSync } from 'node:crypto';
import { createDb, type Db } from '@leanplate/platform';
import { signAccessToken, signServiceToken } from '@leanplate/security';
import { buildApp, type Deps } from '../src/app';

export const GOOD_PASSWORD = 'correct horse battery staple 42';

// Hermetic keys: the shared dev-key file is created lazily and parallel test workers can race to write it.
export const SECRET = 'test-identity-service-secret-0123456789abcdef';
export function newKeyPair() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return {
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}
export const KEYS = newKeyPair();

export class TestClock {
  constructor(public current = new Date('2026-03-01T12:00:00.000Z')) {}
  now() {
    return new Date(this.current.getTime());
  }
  advance(ms: number) {
    this.current = new Date(this.current.getTime() + ms);
  }
}

let counter = 0;
export const uniqueEmail = (prefix = 'user') => `${prefix}${++counter}.${Math.random().toString(36).slice(2, 8)}@example.com`;

export interface CallOptions {
  body?: unknown;
  /** Send this string as the body instead of JSON-encoding `body`. */
  raw?: string;
  bearer?: string;
  /** Replace the whole x-service-token header; `null` omits it. */
  serviceToken?: string | null;
  ip?: string;
  headers?: Record<string, string>;
}

export interface Harness {
  app: Awaited<ReturnType<typeof buildApp>>;
  db: Db;
  clock: TestClock;
  /** Every response body seen so far, for leak scans. */
  seen: string[];
  call(method: string, path: string, opts?: CallOptions): Promise<{ status: number; headers: Headers; text: string; json: any }>;
  register(email?: string, password?: string): Promise<{ email: string; password: string; id: string }>;
  login(email: string, password: string, opts?: CallOptions): ReturnType<Harness['call']>;
  signIn(): Promise<{ email: string; password: string; id: string; accessToken: string; refreshToken: string }>;
  serviceToken(opts?: { audience?: string; issuer?: string; secret?: string; ip?: string }): Promise<string>;
}

const HIGH = { windowMs: 60_000, max: 100_000 };

export async function makeHarness(overrides: Partial<Deps> = {}): Promise<Harness> {
  const clock = (overrides.clock as TestClock | undefined) ?? new TestClock();
  const db = overrides.db ?? (await createDb({ service: 'identity', dataDir: null }));
  const app = await buildApp({ db, clock, serviceSecret: SECRET, ...KEYS, rateLimits: { register: HIGH, login: HIGH }, ...overrides });
  const seen: string[] = [];

  const serviceToken: Harness['serviceToken'] = (o = {}) =>
    signServiceToken({
      secret: o.secret ?? SECRET,
      issuer: o.issuer ?? 'web',
      audience: o.audience ?? 'identity',
      clientIpHash: o.ip ?? 'ip-default',
    });

  const call: Harness['call'] = async (method, path, o = {}) => {
    const headers: Record<string, string> = { ...(o.headers ?? {}) };
    if (o.serviceToken !== null) headers['x-service-token'] = o.serviceToken ?? (await serviceToken({ ip: o.ip }));
    if (o.bearer) headers.authorization = `Bearer ${o.bearer}`;
    let body: string | undefined;
    if (o.raw !== undefined) body = o.raw;
    else if (o.body !== undefined) body = JSON.stringify(o.body);
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await app.request(path, { method, headers, body });
    const text = await res.text();
    seen.push(text);
    let json: any;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }
    return { status: res.status, headers: res.headers, text, json };
  };

  const register: Harness['register'] = async (email = uniqueEmail(), password = GOOD_PASSWORD) => {
    const r = await call('POST', '/v1/register', { body: { email, password } });
    if (r.status !== 201) throw new Error(`register failed: ${r.status} ${r.text}`);
    return { email, password, id: r.json.user.id };
  };
  const login: Harness['login'] = (email, password, o = {}) => call('POST', '/v1/login', { ...o, body: { email, password } });
  const signIn: Harness['signIn'] = async () => {
    const u = await register();
    const r = await login(u.email, u.password);
    if (r.status !== 200) throw new Error(`login failed: ${r.status} ${r.text}`);
    return { ...u, accessToken: r.json.accessToken, refreshToken: r.json.refreshToken };
  };

  return { app, db, clock, seen, call, register, login, signIn, serviceToken };
}

export { signAccessToken };
