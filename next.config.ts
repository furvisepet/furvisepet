import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "furvise.com" }],
        destination: "https://www.furvise.com/:path*",
        permanent: true,
        basePath: false,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "petwise-nu.vercel.app" }],
        destination: "https://www.furvise.com/:path*",
        permanent: true,
        basePath: false,
      },
    ];
  },
};

export default nextConfig;
