import type { Metadata } from "next";
import { createPrivatePageMetadata } from "../../lib/seo";

export const metadata: Metadata = createPrivatePageMetadata("Confirm Password Reset");
export const dynamic = "force-dynamic";

export default function ResetPasswordConfirmLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
