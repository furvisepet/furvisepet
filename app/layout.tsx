import type { Metadata } from "next";
import { AppearanceProvider } from "./components/appearance-provider";
import { ThemeBootstrap } from "./components/theme-bootstrap";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://furvise.com"),
  title: "Furvise — Pet Care History, Notes, and Guidance",
  description:
    "Furvise keeps your pet’s care history connected — profiles, care updates, saved details, vet-prep notes, and focused guidance in one private place.",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
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
