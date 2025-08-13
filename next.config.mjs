const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/purchases.json",
        destination: "/data/purchases.json",
      },
    ];
  },
};

export default nextConfig;