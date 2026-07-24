import type { Metadata } from "next";
import { HomepageClient } from "./components/homepage-client";
import {
  CANONICAL_ORIGIN,
  HOME_TITLE,
  SOCIAL_DESCRIPTION,
  canonicalUrl,
  createPublicPageMetadata,
} from "./lib/seo";

export const metadata: Metadata = {
  ...createPublicPageMetadata({
    title: HOME_TITLE,
    description: SOCIAL_DESCRIPTION,
    path: "/",
  }),
  title: { absolute: HOME_TITLE },
};

const structuredData = [
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Furvise",
    url: canonicalUrl(),
    description: SOCIAL_DESCRIPTION,
  },
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Furvise",
    url: canonicalUrl(),
    logo: `${CANONICAL_ORIGIN}/brand/furvise-logo.png`,
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
