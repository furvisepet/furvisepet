import type { Metadata } from "next";
import { AppearanceProvider } from "./components/appearance-provider";
import { ImpactSiteVerification } from "./components/impact-site-verification";
import { ThemeBootstrap } from "./components/theme-bootstrap";
import "./globals.css";

export const metadata: Metadata = {
  title: "Furvise",
  description: "Your pet family care companion.",
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
        <ImpactSiteVerification />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeBootstrap />
        <AppearanceProvider>{children}</AppearanceProvider>
      </body>
    </html>
  );
}
