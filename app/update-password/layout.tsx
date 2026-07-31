import type { Metadata } from "next";
import { createPrivatePageMetadata } from "../lib/seo";

export const metadata: Metadata = createPrivatePageMetadata("Update Password");
export const dynamic = "force-dynamic";

export default function UpdatePasswordLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
