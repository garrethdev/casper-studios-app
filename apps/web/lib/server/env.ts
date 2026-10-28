import 'server-only';
import { loadDevEnv } from '@leanplate/platform';
import { parseAllowedOrigins } from '../origin-guard';

// Secrets live in the repo root's git-ignored .env.local (and .data/dev-keys.json); they are never copied into apps/web.
// loadDevEnv() does nothing in production, where the platform provides real environment variables.
loadDevEnv();

export const identityUrl = () => process.env.IDENTITY_URL ?? 'http://localhost:4001';
export const mealsUrl = () => process.env.MEALS_URL ?? 'http://localhost:4002';

export const allowedOrigins = () => parseAllowedOrigins(process.env.APP_ORIGIN);
