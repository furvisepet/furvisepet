import type { Metadata } from "next";
import { createPrivatePageMetadata } from "../lib/seo";

export const metadata: Metadata = createPrivatePageMetadata("Log In");

export default function LoginLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
