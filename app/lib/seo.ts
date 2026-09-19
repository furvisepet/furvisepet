import type { Metadata } from "next";

// Keep canonical domain consistent with Vercel domain redirect settings and Google Search Console property.
export const CANONICAL_ORIGIN = "https://www.furvise.com";

export const HOME_TITLE = "Furvise | Pet Care Notes, History and Questions";
export const HOME_DESCRIPTION =
  "Log your pet's care, find past notes, and ask questions about what you've logged. Furvise organizes care information; it does not diagnose.";
export const SOCIAL_DESCRIPTION =
  "Keep each pet's care notes together, find past entries, and prepare a summary to review with your vet.";
export const ORGANIZATION_DESCRIPTION =
  "Furvise helps pet owners log care, find saved notes, and ask questions about their recorded history.";
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
