import type { MetadataRoute } from "next";
import { canonicalUrl } from "./lib/seo";

const lastModified = new Date("2026-07-23T00:00:00.000Z");

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: canonicalUrl(),
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: canonicalUrl("/privacy"),
      lastModified,
      changeFrequency: "yearly",
      priority: 0.4,
    },
  ];
}
