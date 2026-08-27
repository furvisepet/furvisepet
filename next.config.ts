import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import { getSecurityHeadersForNextConfig } from "./app/lib/security/headers/security-headers";

const IMMUTABLE_NAVIGATION_ASSETS = [
  "/images/nav-today-v1.webp",
  "/images/nav-history-v1.webp",
  "/images/nav-ask-v1.webp",
  "/images/nav-pets-v1.webp",
  "/images/nav-products-v1.webp",
  "/images/nav-more-v1.webp",
] as const;

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
      ...IMMUTABLE_NAVIGATION_ASSETS.map((source) => ({
        source,
        headers: [...immutableAssetHeaders],
      })),
      ...[
        "/brand/furvise-logo.svg",
        "/brand/furvise-wordmark.svg",
        "/brand/furvise-heron.svg",
      ].map((source) => ({
        headers: [...immutableAssetHeaders],
        source,
      })),
      {
        source: "/reset-password/confirm",
        headers: [
          { key: "Cache-Control", value: "private, no-cache, no-store, must-revalidate, max-age=0" },
          { key: "Expires", value: "0" },
          { key: "Pragma", value: "no-cache" },
          // Native form POSTs are non-CORS requests. `no-referrer` makes their
          // standards-defined Origin value opaque (`null`), so retain only a
          // same-origin referrer; URL fragments are never included.
          { key: "Referrer-Policy", value: "same-origin" },
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

const immutableAssetHeaders = [
  { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
] as const;

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
