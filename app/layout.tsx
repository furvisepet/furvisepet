import type { Metadata, Viewport } from "next";
import { Barlow_Condensed } from "next/font/google";
import { ActionVisualAudit } from "./components/action-visual-audit";
import { AuthenticatedAppChrome } from "./components/authenticated-app-chrome";
import { AskComposerFocusProvider } from "./lib/navigation/ask-composer-focus";
import {
  CANONICAL_ORIGIN,
  FURVISE_OG_IMAGE_URL,
  HOME_DESCRIPTION,
  HOME_TITLE,
  SOCIAL_DESCRIPTION,
} from "./lib/seo";
import "./globals.css";

const marketingDisplay = Barlow_Condensed({
  display: "swap",
  fallback: ["Arial Narrow", "Arial", "sans-serif"],
  subsets: ["latin"],
  variable: "--font-marketing-display",
  weight: "700",
});

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
        width: 3200,
        height: 800,
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
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    shortcut: [{ url: "/favicon.ico" }],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
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
      className={`h-full antialiased ${marketingDisplay.variable}`}
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
        <AskComposerFocusProvider>
          <AuthenticatedAppChrome />
          {children}
        </AskComposerFocusProvider>
        {process.env.NODE_ENV === "development" ? <ActionVisualAudit /> : null}
      </body>
    </html>
  );
}
