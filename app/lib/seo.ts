import type { Metadata } from "next";

// Keep canonical domain consistent with Vercel domain redirect settings and Google Search Console property.
export const CANONICAL_ORIGIN = "https://www.furvise.com";

export const HOME_TITLE = "Furvise | Pet Care History, Notes, Products, and Guidance";
export const HOME_DESCRIPTION =
  "Furvise keeps your pet’s care history, saved details, product notes, and focused AI guidance in one private place.";
export const SOCIAL_DESCRIPTION =
  "Keep pet profiles, care updates, saved details, vet-prep notes, and product guidance organized in one private place.";
export const FURVISE_OG_IMAGE_URL = `${CANONICAL_ORIGIN}/brand/furvise-og.png`;

export const PRIVATE_PAGE_ROBOTS: NonNullable<Metadata["robots"]> = {
  index: false,
  follow: false,
  nocache: true,
};

export function createPrivatePageMetadata(title: string, description?: string): Metadata {
  return {
    title,
    description,
    robots: PRIVATE_PAGE_ROBOTS,
  };
}

export function canonicalUrl(path = "/") {
  return new URL(path, `${CANONICAL_ORIGIN}/`).toString();
}

export function createPublicPageMetadata({
  description,
  path,
  title,
}: {
  description: string;
  path: string;
  title: string;
}): Metadata {
  const url = canonicalUrl(path);

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: "Furvise",
      type: "website",
      images: [
        {
          url: FURVISE_OG_IMAGE_URL,
          width: 1200,
          height: 630,
          alt: "Furvise pet care history, notes, products, and guidance",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [FURVISE_OG_IMAGE_URL],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-snippet": -1,
        "max-image-preview": "large",
        "max-video-preview": -1,
      },
    },
  };
}
