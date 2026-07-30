import type { Metadata } from "next";
import { LegalPageShell } from "../components/legal-page-shell";
import { createPublicPageMetadata } from "../lib/seo";

export const metadata: Metadata = createPublicPageMetadata({
  description: "Read the terms for using Furvise.",
  path: "/terms",
  title: "Terms",
});

export default function TermsPage() {
  return <LegalPageShell><article><h1 className="text-4xl font-semibold tracking-tight">Terms</h1><p className="mt-6 leading-7 text-[var(--text-secondary)]">Furvise helps you organize pet care information. It does not diagnose conditions or replace veterinary care. Use the service lawfully, keep your account secure, and contact a veterinarian for urgent or medical concerns.</p><p className="mt-4 leading-7 text-[var(--text-secondary)]">Product availability and details can change. Check current labels and retailer information before buying or using a product.</p></article></LegalPageShell>;
}
