import { LegalPageShell } from "../components/legal-page-shell";
import { createPublicPageMetadata } from "../lib/seo";
import { ContactForm } from "./contact-form";

export const metadata = createPublicPageMetadata({ title: "Contact us", description: "Report a bug, share a screenshot or help improve Furvise during public beta.", path: "/contact" });

export default function ContactPage() {
  return <LegalPageShell links={[{ href: "/", label: "Home" }, { href: "/privacy", label: "Privacy" }]}>
    <header className="mb-8">
      <p className="app-page-eyebrow">Contact us</p>
      <h1 className="mt-2 font-display text-4xl font-bold leading-tight sm:text-5xl">HELP US IMPROVE FURVISE</h1>
      <p className="mt-4 max-w-[700px] text-lg leading-relaxed text-[var(--text-secondary)]">Furvise is in public beta, and we’re improving it with your feedback. Found a bug, an answer that missed the mark, or Ask didn’t respond? Tell us what happened.</p>
    </header>
    <ContactForm />
  </LegalPageShell>;
}
