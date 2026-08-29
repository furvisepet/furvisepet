import type { Metadata } from "next";

// Keep canonical domain consistent with Vercel domain redirect settings and Google Search Console property.
export const CANONICAL_ORIGIN = "https://www.furvise.com";

export const HOME_TITLE = "Furvise | Remember What Matters";
export const HOME_DESCRIPTION =
  "Furvise keeps questions, care updates, and history connected to each pet so you do not start from zero.";
export const SOCIAL_DESCRIPTION =
  "Furvise remembers your pet by keeping questions, care updates, and history together over time.";
export const FURVISE_OG_IMAGE_URL = `${CANONICAL_ORIGIN}/brand/furvise-logo.svg`;

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
          width: 3200,
          height: 800,
          alt: "Furvise keeps each pet's questions, care updates, and history together over time",
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
