import type { Metadata } from "next";
import { AppearanceProvider } from "./components/appearance-provider";
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
