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
        "/auth",
        "/care-history",
        "/care-log",
        "/catalog",
        "/dashboard",
        "/dogs",
        "/forgot-password",
        "/history",
        "/login",
        "/membership",
        "/onboarding",
        "/pets",
        "/products",
        "/reset-password",
        "/results",
        "/settings",
        "/shop",
        "/today",
        "/update-password",
        "/vet-brief",
        "/vet-briefs",
      ],
    },
    sitemap: canonicalUrl("/sitemap.xml"),
    host: CANONICAL_ORIGIN,
  };
}
