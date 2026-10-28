import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Stops `next dev` from writing an AGENTS.md into the repo.
  agentRules: false,
  reactStrictMode: true,
  // The workspace packages ship TypeScript source, so Next must compile them.
  transpilePackages: ['@leanplate/contracts', '@leanplate/security', '@leanplate/platform'],
  // Pulled in by @leanplate/platform's db module; the web app never opens a database.
  serverExternalPackages: ['@electric-sql/pglite', 'postgres'],
  outputFileTracingRoot: root,
  turbopack: { root },
  experimental: {
    // Analyze requests carry a downscaled photo (at most about 4.5 MB of base64).
    proxyClientMaxBodySize: '8mb',
  },
};

export default nextConfig;
