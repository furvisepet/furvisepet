import type { Metadata } from "next";
import { createPrivatePageMetadata } from "../lib/seo";

export const metadata: Metadata = createPrivatePageMetadata("Reset Password");

export default function ForgotPasswordLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
