import type { MetadataRoute } from "next";
import { canonicalUrl } from "./lib/seo";

const significantUpdates = {
  homepage: "2026-09-03",
  privacy: "2026-09-03",
  terms: "2026-09-03",
} as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: canonicalUrl(),
      lastModified: significantUpdates.homepage,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: canonicalUrl("/privacy"),
      lastModified: significantUpdates.privacy,
      changeFrequency: "yearly",
      priority: 0.4,
    },
    {
      url: canonicalUrl("/terms"),
      lastModified: significantUpdates.terms,
      changeFrequency: "yearly",
      priority: 0.4,
    },
  ];
}
