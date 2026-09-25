import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@foodbowl/shared'],
  // Emits a minimal self-contained server (.next/standalone) for the Docker
  // image, so the runtime stage needs no pnpm and no full node_modules.
  output: 'standalone',
  experimental: {
    // In a monorepo, dependencies are hoisted above apps/web; tracing has to
    // start at the repo root or the standalone bundle misses them.
    outputFileTracingRoot: path.join(path.dirname(fileURLToPath(import.meta.url)), '../../'),
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
};

export default nextConfig;
