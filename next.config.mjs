const dev = process.env.NODE_ENV !== 'production';

const nextConfig = {
  assetPrefix: dev ? 'http://localhost:3000' : 'https://stockhold.in', // use HTTPS in production
  experimental: {
    serverComponentsExternalPackages: ['yahoo-finance2']
  },
  api: {
    responseLimit: false,
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: dev
          ? 'http://localhost:3000/:path*'       // dev backend
          : 'https://stockhold.in/api/:path*',   // production API over HTTPS
      },
    ];
  },
  async headers() {
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
    ]
  },
};

export default nextConfig;