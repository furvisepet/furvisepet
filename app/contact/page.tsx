import { PageHeader } from "../components/product-primitives";
import { LegalPageShell } from "../components/legal-page-shell";
import { createPublicPageMetadata } from "../lib/seo";
import { ContactForm } from "./contact-form";

export const metadata = createPublicPageMetadata({ title: "Contact us", description: "Report a bug, share a screenshot or help improve Furvise during public beta.", path: "/contact" });

export default function ContactPage() {
  return <LegalPageShell links={[{ href: "/", label: "Home" }, { href: "/privacy", label: "Privacy" }]}>
    <PageHeader eyebrow="Contact us" title="Help us improve Furvise" supportingText="Furvise is in public beta, and we’re improving it with your feedback. Found a bug, an answer that missed the mark, or Ask didn’t respond? Tell us what happened." />
    <ContactForm />
  </LegalPageShell>;
}
