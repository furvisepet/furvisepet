import type { Metadata } from "next";
import { LegalPageHeader, LegalPageShell, LegalSection } from "../components/legal-page-shell";
import { FREE_ASK_ALLOWANCE, PLAN_CAPABILITIES, PLUS_ASK_ALLOWANCE } from "../lib/billing/plan-limits";
import { createPublicPageMetadata } from "../lib/seo";

const description =
  "Read the terms for using Furvise, including accounts, AI-assisted information, membership, billing, and veterinary-care limitations.";

export const metadata: Metadata = createPublicPageMetadata({
  title: "Terms of Use",
  description,
  path: "/terms",
});

export default function TermsPage() {
  return (
    <LegalPageShell
      links={[
        { href: "/privacy", label: "Privacy" },
        { href: "/membership", label: "Membership" },
        { href: "/", label: "Home" },
      ]}
    >
      <LegalPageHeader intro="These terms explain the basic rules for using Furvise." title="TERMS OF USE" />

      <LegalSection title="1. USING FURVISE">
        <p>
          You may use Furvise only in compliance with applicable law and these terms. You agree to provide accurate
          account information and to use Furvise only for accounts and pet information you are authorized to manage.
        </p>
      </LegalSection>

      <LegalSection title="2. FURVISE IS NOT A VETERINARIAN">
        <p>
          Furvise organizes pet-care information and provides AI-assisted information. It does not diagnose or treat
          medical conditions, provide veterinary care, operate as an emergency service, or replace a veterinarian.
          Contact a veterinarian or emergency veterinary clinic promptly for urgent or emergency concerns.
        </p>
      </LegalSection>

      <LegalSection title="3. AI-GENERATED INFORMATION">
        <p>
          AI-generated information can be incomplete, inaccurate, or wrong. Use your judgment and verify medical
          decisions with a veterinarian. Furvise does not guarantee that AI-generated information is error-free or
          suitable for a particular pet or situation.
        </p>
      </LegalSection>

      <LegalSection title="4. YOUR ACCOUNT">
        <p>
          Keep your sign-in credentials secure. You are responsible for activity under your account and should notify
          Furvise promptly if you suspect unauthorized access or use.
        </p>
      </LegalSection>

      <LegalSection title="5. PET INFORMATION">
        <p>
          You are responsible for the accuracy of the pet information you provide. Furvise may use that information
          to keep your pet&apos;s history connected and personalize future output for your account.
        </p>
      </LegalSection>

      <LegalSection title="6. FREE AND PLUS MEMBERSHIP">
        <p>
          The Free membership includes {FREE_ASK_ALLOWANCE} Ask uses each month and up to{" "}
          {PLAN_CAPABILITIES.free.maxPets} pet. Furvise Plus includes {PLUS_ASK_ALLOWANCE} Ask uses each month and up
          to {PLAN_CAPABILITIES.plus.maxPets} pets
          {PLAN_CAPABILITIES.plus.vetPrepExports ? ", plus Vet Brief" : ""}. Plus is a monthly paid subscription.
        </p>
        <p>
          Current prices and the features included with each plan are shown before purchase. You can cancel Plus
          through Furvise&apos;s billing controls. Cancellation takes effect according to the billing status and period
          shown in your account.
        </p>
      </LegalSection>

      <LegalSection title="7. BILLING">
        <p>
          Stripe processes subscription payments. Paid subscriptions renew on a recurring basis until canceled, and
          billing status controls access to paid features. Taxes may apply. You can manage your subscription through
          Furvise&apos;s billing controls.
        </p>
      </LegalSection>

      <LegalSection title="8. SERVICE AVAILABILITY">
        <p>
          Furvise may change, pause, or experience interruptions. We do not promise that the service will always be
          available or error-free. Features that depend on AI or third-party services may occasionally be unavailable.
        </p>
      </LegalSection>

      <LegalSection title="9. ACCEPTABLE USE">
        <p>You may not:</p>
        <ul className="list-disc space-y-2 pl-6 marker:text-[var(--text-primary)]">
          <li>Use Furvise unlawfully or to harm others.</li>
          <li>Attempt unauthorized access to accounts, systems, or data.</li>
          <li>Interfere with, overload, or disrupt the service.</li>
          <li>Automate abusive activity or circumvent security, usage, or access controls.</li>
        </ul>
      </LegalSection>

      <LegalSection title="10. INTELLECTUAL PROPERTY">
        <p>
          Furvise&apos;s software, design, branding, and related materials belong to Furvise or its licensors and are
          protected by applicable law. You retain rights in the information you submit. You give Furvise the limited
          permission needed to host, process, display, and use that information to provide, maintain, and secure the
          service for you.
        </p>
      </LegalSection>

      <LegalSection title="11. ACCOUNT SUSPENSION OR TERMINATION">
        <p>
          Furvise may restrict or terminate access when reasonably necessary to address abuse, security threats,
          legal requirements, or material violations of these terms. You may delete your account through the account
          settings provided by Furvise.
        </p>
      </LegalSection>

      <LegalSection title="12. LIMITATION OF SERVICE">
        <p>
          Furvise is an information and organization service. It does not guarantee medical, veterinary, financial,
          product, or other outcomes. You are responsible for deciding how to act on information provided through the
          service and for seeking qualified professional care when needed.
        </p>
      </LegalSection>

      <LegalSection title="13. CHANGES TO THESE TERMS">
        <p>
          We may update these terms as Furvise changes or as legal requirements evolve. We will post revised terms
          here and update the date above. Continued use after an update means the revised terms apply to your use.
        </p>
      </LegalSection>

      <LegalSection title="14. CONTACT">
        <p>
          Questions about these terms can be sent to{" "}
          <a
            className="inline-flex min-h-11 items-center rounded-sm font-semibold text-[var(--text-primary)] underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            href="mailto:furvisepet@gmail.com"
          >
            furvisepet@gmail.com
          </a>
          .
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
