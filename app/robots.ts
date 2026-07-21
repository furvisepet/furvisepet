import type { MetadataRoute } from "next";

const siteUrl = "https://furvise.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/account",
        "/ask",
        "/care-log",
        "/dashboard",
        "/dogs",
        "/forgot-password",
        "/login",
        "/onboarding",
        "/pets",
        "/results",
        "/update-password",
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
