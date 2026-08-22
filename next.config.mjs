const siteUrl = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, '');

const nextConfig = {
  assetPrefix: siteUrl,
  serverExternalPackages: ['yahoo-finance2', 'kiteconnect', 'ws', 'bufferutil', 'utf-8-validate'],
  // NOTE: removed the old rewrites() block that sent /api/:path* to
  // http://localhost:3000/:path* (stripping /api). Next.js checks
  // rewrites like that BEFORE dynamic routes (e.g. app/api/orders/[order_id]),
  // so any /api/* request that didn't hit an exact static route file
  // (like /api/orders/PAPER123, /api/positions/whatever, etc.) was being
  // silently redirected to a non-existent /orders/PAPER123 page instead
  // of ever reaching the dynamic route — that's what produced the
  // persistent, restart-proof 404s on Modify/Cancel. Since this rewrite
  // pointed at the same origin/port either way, it wasn't proxying
  // anywhere external and had no real purpose — Next.js already serves
  // everything under app/api/* natively without it.
  async headers() {
    const cors = [
      { key: 'Access-Control-Allow-Origin', value: '*' },
      { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
      { key: 'Access-Control-Allow-Methods', value: 'GET, POST, DELETE, OPTIONS' },
    ];
    return [
      {
        source: '/api/long-data',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
        ],
      },
      { source: '/api/desktop/:path*', headers: cors },
      { source: '/api/auth/signup', headers: cors },
      { source: '/api/auth/login', headers: cors },
      { source: '/api/auth/me', headers: cors },
      { source: '/api/license/status', headers: cors },
      { source: '/api/admin/members', headers: cors },
    ];
  },
};

export default nextConfig;
