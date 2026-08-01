import type { Metadata, Viewport } from "next";
import { ActionVisualAudit } from "./components/action-visual-audit";
import { AuthenticatedAppChrome } from "./components/authenticated-app-chrome";
import {
  CANONICAL_ORIGIN,
  FURVISE_OG_IMAGE_URL,
  HOME_DESCRIPTION,
  HOME_TITLE,
  SOCIAL_DESCRIPTION,
} from "./lib/seo";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(CANONICAL_ORIGIN),
  applicationName: "Furvise",
  title: {
    default: HOME_TITLE,
    template: "%s | Furvise",
  },
  description: HOME_DESCRIPTION,
  keywords: [
    "pet care app",
    "pet care history",
    "dog care notes",
    "cat care notes",
    "pet product guidance",
    "pet health notes",
    "vet prep notes",
  ],
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: HOME_TITLE,
    description: SOCIAL_DESCRIPTION,
    siteName: "Furvise",
    type: "website",
    url: CANONICAL_ORIGIN,
    images: [
      {
        url: FURVISE_OG_IMAGE_URL,
        width: 1536,
        height: 1024,
        alt: "Furvise pet care history, notes, products, and guidance",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: HOME_TITLE,
    description: SOCIAL_DESCRIPTION,
    images: [FURVISE_OG_IMAGE_URL],
  },
  icons: {
    shortcut: [{ url: "/favicon.ico" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Furvise",
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#123F27",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
      data-color-scheme="light"
      data-scroll-behavior="smooth"
    >
      <head>
        <meta name="color-scheme" content="light" />
        <meta
          name="impact-site-verification"
          value="716da39a-4e9c-4773-8cc0-b695f0f13ccb"
        />
      </head>
      <body className="min-h-full flex flex-col">
        <AuthenticatedAppChrome />
        {children}
        {process.env.NODE_ENV === "development" ? <ActionVisualAudit /> : null}
      </body>
    </html>
  );
}
