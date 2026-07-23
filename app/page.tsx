import type { Metadata } from "next";
import { HomepageClient } from "./components/homepage-client";

const title = "Furvise, Pet Care History, Notes, and Guidance";
const description =
  "Furvise keeps your pet's care history connected, profiles, care updates, saved details, vet-prep notes, and focused guidance in one private place.";
const canonicalUrl = "https://furvise.com";

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: canonicalUrl,
  },
  openGraph: {
    title,
    description,
    url: canonicalUrl,
    siteName: "Furvise",
    type: "website",
  },
  twitter: {
    card: "summary",
    title,
    description,
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

export default function HomePage() {
  return <HomepageClient />;
}
