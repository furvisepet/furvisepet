import type { MetadataRoute } from "next";
import { canonicalUrl } from "./lib/seo";

const significantUpdates = {
  homepage: "2026-09-15",
  privacy: "2026-09-03",
  terms: "2026-09-03",
} as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: canonicalUrl("/release-notes"), lastModified: "2026-09-15", changeFrequency: "weekly", priority: 0.6 },
    { url: canonicalUrl("/contact"), lastModified: "2026-09-15", changeFrequency: "monthly", priority: 0.4 },
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
