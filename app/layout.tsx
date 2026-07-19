import type { Metadata } from "next";
import { AppearanceProvider } from "./components/appearance-provider";
import { ThemeBootstrap } from "./components/theme-bootstrap";
import "./globals.css";

export const metadata: Metadata = {
  title: "Furvise",
  description: "Your pet family care companion.",
  other: {
    "impact-site-verification": "716da39a-4e9c-4773-8cc0-b695f0f13ccb",
  },
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
      <body className="min-h-full flex flex-col">
        <ThemeBootstrap />
        <AppearanceProvider>{children}</AppearanceProvider>
      </body>
    </html>
  );
}
