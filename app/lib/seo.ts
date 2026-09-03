import type { Metadata } from "next";

// Keep canonical domain consistent with Vercel domain redirect settings and Google Search Console property.
export const CANONICAL_ORIGIN = "https://www.furvise.com";

export const HOME_TITLE = "Furvise | Your Pet's Story, Understood Over Time";
export const HOME_DESCRIPTION =
  "Furvise keeps your pet's questions, changes, routines, and history connected over time, so what happened before can inform what matters now.";
export const SOCIAL_DESCRIPTION =
  "An AI that follows your pet's story, not just the latest question. Furvise keeps important context connected over time.";
export const ORGANIZATION_DESCRIPTION =
  "Furvise is a pet-care intelligence service that keeps each pet's questions, changes, routines, and history connected over time.";
export const FURVISE_OG_IMAGE_PATH = "/brand/furvise-social.png";
export const FURVISE_OG_IMAGE_URL = `${CANONICAL_ORIGIN}${FURVISE_OG_IMAGE_PATH}`;
export const FURVISE_OG_IMAGE_ALT =
  "Furvise logo with the words Remember what matters and Your pet's story, understood over time";

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
  socialDescription = description,
  title,
}: {
  description: string;
  path: string;
  socialDescription?: string;
  title: string;
}): Metadata {
  const url = canonicalUrl(path);

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description: socialDescription,
      url,
      siteName: "Furvise",
      type: "website",
      images: [
        {
          url: FURVISE_OG_IMAGE_URL,
          width: 1200,
          height: 630,
          alt: FURVISE_OG_IMAGE_ALT,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: socialDescription,
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
