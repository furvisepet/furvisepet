import type { MetadataRoute } from "next";

const siteUrl = "https://furvise.com";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteUrl,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${siteUrl}/privacy`,
      changeFrequency: "monthly",
      priority: 0.4,
    },
  ];
}
