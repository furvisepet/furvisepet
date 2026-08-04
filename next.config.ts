import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import { getSecurityHeadersForNextConfig } from "./app/lib/security/headers/security-headers";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Keep the Next.js development route indicator out of local screenshot QA.
  // It is development-only and is never emitted by production builds.
  devIndicators: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: getSecurityHeadersForNextConfig(),
      },
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-cache, no-store, must-revalidate, max-age=0" },
          { key: "Expires", value: "0" },
          { key: "Pragma", value: "no-cache" },
        ],
      },
      {
        source: "/reset-password/confirm",
        headers: [
          { key: "Cache-Control", value: "private, no-cache, no-store, must-revalidate, max-age=0" },
          { key: "Expires", value: "0" },
          { key: "Pragma", value: "no-cache" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
    ];
  },
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

export default withSentryConfig(nextConfig, {
  org: "furvise",
  project: "nextjs",
  silent: !process.env.CI,
  widenClientFileUpload: true,
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
});
