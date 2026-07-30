import type { Metadata } from "next";
import { createPrivatePageMetadata } from "../lib/seo";

export const metadata: Metadata = createPrivatePageMetadata("Update Password");

export default function UpdatePasswordLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
