import type { Metadata } from "next";
import { AppearanceProvider } from "./components/appearance-provider";
import { ThemeBootstrap } from "./components/theme-bootstrap";
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
        width: 1200,
        height: 630,
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
    icon: [
      { url: "/favicon.ico", sizes: "48x48", type: "image/x-icon" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    shortcut: [{ url: "/favicon.ico" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/site.webmanifest",
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
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      data-theme="dark"
    >
      <head>
        <meta
          name="impact-site-verification"
          value="716da39a-4e9c-4773-8cc0-b695f0f13ccb"
        />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeBootstrap />
        <AppearanceProvider>{children}</AppearanceProvider>
      </body>
    </html>
  );
}
