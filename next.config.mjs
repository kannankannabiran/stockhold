const dev = process.env.NODE_ENV !== 'production';

const nextConfig = {
  assetPrefix: dev ? '' : 'https://stockhold.in', // use HTTPS in production
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
};

export default nextConfig;

