const dev = process.env.NODE_ENV !== 'production';

const nextConfig = {
  assetPrefix: dev ? 'http://localhost:3000' : 'http://localhost:3000', // use HTTPS in production
  serverExternalPackages: ['yahoo-finance2', 'kiteconnect', 'ws'],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push('bufferutil', 'utf-8-validate');
    }
    return config;
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: dev
          ? 'http://localhost:3000/:path*'       // dev backend
          : 'http://localhost:3000/api/:path*',   // production API over HTTPS
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
