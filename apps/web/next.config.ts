import type { NextConfig } from 'next';

const apiUrl = process.env.API_URL;
if (!apiUrl) {
  throw new Error('API_URL is not set. Copy apps/web/.env.example to apps/web/.env.local.');
}

const nextConfig: NextConfig = {
  images: {
    // Dish photos live in Vercel Blob; next/image resizes them for each screen.
    remotePatterns: [{ protocol: 'https', hostname: '*.public.blob.vercel-storage.com' }],
  },
  /**
   * The browser only ever talks to this site. Requests to /api/* are forwarded unchanged to the
   * NestJS API, so the auth cookie Nest sets is first-party (works in every browser) and no CORS
   * is needed. This is pure forwarding: no business logic runs in Next.js.
   */
  /** /reference has no page of its own; it opens the first list. */
  async redirects() {
    return [
      { source: '/reference', destination: '/reference/allergens', permanent: false },
      { source: '/catalogue', destination: '/catalogue/dishes', permanent: false },
    ];
  },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/:path*` }];
  },
};

export default nextConfig;
