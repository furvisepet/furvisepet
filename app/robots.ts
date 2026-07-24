import type { MetadataRoute } from "next";
import { CANONICAL_ORIGIN, canonicalUrl } from "./lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/account",
        "/ask",
        "/api",
        "/care-history",
        "/care-log",
        "/dashboard",
        "/dogs",
        "/forgot-password",
        "/login",
        "/onboarding",
        "/pets",
        "/results",
        "/shop",
        "/update-password",
      ],
    },
    sitemap: canonicalUrl("/sitemap.xml"),
    host: CANONICAL_ORIGIN,
  };
}
