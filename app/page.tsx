import type { Metadata } from "next";
import { HomepageClient } from "./components/homepage-client";
import {
  CANONICAL_ORIGIN,
  HOME_DESCRIPTION,
  HOME_TITLE,
  ORGANIZATION_DESCRIPTION,
  SOCIAL_DESCRIPTION,
  canonicalUrl,
  createPublicPageMetadata,
} from "./lib/seo";

export const metadata: Metadata = {
  ...createPublicPageMetadata({
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    path: "/",
    socialDescription: SOCIAL_DESCRIPTION,
  }),
  title: { absolute: HOME_TITLE },
};

const structuredData = [
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Furvise",
    url: canonicalUrl(),
    description: HOME_DESCRIPTION,
  },
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Furvise",
    url: canonicalUrl(),
    logo: `${CANONICAL_ORIGIN}/brand/furvise-logo.svg`,
    description: ORGANIZATION_DESCRIPTION,
  },
];

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
        }}
      />
      <HomepageClient />
    </>
  );
}
