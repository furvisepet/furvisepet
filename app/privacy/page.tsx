import type { Metadata } from "next";
import { LegalPageHeader, LegalPageShell, LegalSection } from "../components/legal-page-shell";
import { createPublicPageMetadata } from "../lib/seo";

const description =
  "Learn what information Furvise uses, how pet and account data support the service, and the controls available to you.";

export const metadata: Metadata = createPublicPageMetadata({
  title: "Privacy",
  description,
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <LegalPageShell
      links={[
        { href: "/terms", label: "Terms" },
        { href: "/account", label: "Account settings", signedInOnly: true },
        { href: "/", label: "Home" },
      ]}
    >
      <LegalPageHeader
        intro="Furvise keeps the information you choose to save so your pet's story can stay connected over time. This page explains what we collect, why we use it, and the controls you have."
        title="PRIVACY"
      />

      <LegalSection title="1. INFORMATION YOU GIVE FURVISE">
        <p>We collect information you choose to provide when you use Furvise, including:</p>
        <ul className="list-disc space-y-2 pl-6 marker:text-[var(--text-primary)]">
          <li>Your email address, sign-in method, and account authentication information.</li>
          <li>Pet profile details, such as name, species, sex, age, and other details you save.</li>
          <li>Today updates, care-history entries, and Ask conversations.</li>
          <li>Pet details and owner preferences that Furvise remembers to keep future interactions connected.</li>
          <li>Information included in or used to prepare a Vet Brief.</li>
          <li>Feedback, support requests, and other messages you send us.</li>
          <li>Subscription identifiers, membership status, and related billing records.</li>
        </ul>
        <p>Stripe processes payment details for paid memberships. Furvise does not store your full card number.</p>
      </LegalSection>

      <LegalSection title="2. INFORMATION COLLECTED AUTOMATICALLY">
        <p>
          When you use Furvise, we may receive basic technical and request information, such as browser or device
          type, network and request data, and approximate region or country when a platform or network provides it.
          We may also collect security and abuse signals, service diagnostics, and privacy-conscious operational
          telemetry needed to keep Furvise reliable and secure.
        </p>
      </LegalSection>

      <LegalSection title="3. HOW FURVISE USES INFORMATION">
        <p>We use information to:</p>
        <ul className="list-disc space-y-2 pl-6 marker:text-[var(--text-primary)]">
          <li>Provide and personalize Furvise.</li>
          <li>Keep your pet information connected over time.</li>
          <li>Answer Ask questions using context authorized for your account and selected pet.</li>
          <li>Generate Vet Briefs when that feature is available to you.</li>
          <li>Maintain your account, authentication, and security.</li>
          <li>Apply Free and Plus usage allowances and maintain billing status.</li>
          <li>Diagnose service problems and improve reliability.</li>
          <li>Prevent abuse and fraud, and comply with legal obligations.</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. AI AND PET INFORMATION">
        <p>
          Furvise uses AI to help answer questions and organize pet-care information. When you make an AI request,
          Furvise may send an AI service provider the information and account or pet context needed to respond to
          that request. We aim to use only context relevant to the request.
        </p>
        <p>
          Furvise is not a veterinarian or a substitute for veterinary care. AI-generated information may be
          incomplete or incorrect. You remain responsible for decisions about your pet and should consult a
          veterinarian about medical concerns.
        </p>
      </LegalSection>

      <LegalSection title="5. HOW INFORMATION IS SHARED">
        <p>Furvise does not sell personal information.</p>
        <p>
          We share information only as reasonably needed to operate Furvise, including with providers that support
          authentication and database hosting, AI features, billing, infrastructure, security, monitoring, and
          customer support. These providers process information for the services they provide to us. We may also
          disclose information when required by law or when reasonably necessary to protect users, Furvise, or the
          public from fraud, abuse, or safety threats.
        </p>
      </LegalSection>

      <LegalSection title="6. PET DATA AND MULTI-PET ISOLATION">
        <p>
          Pet information is associated with the signed-in Furvise account and, where applicable, with a specific
          pet. Furvise uses the selected pet&apos;s information when providing pet-specific features. You should confirm
          that the correct pet is selected before saving information or asking a pet-specific question.
        </p>
      </LegalSection>

      <LegalSection title="7. DATA RETENTION">
        <p>
          Furvise keeps information while your account is active and for as long as reasonably needed to provide the
          service, resolve disputes, maintain security, prevent abuse, or meet legal obligations. Retention may vary
          by the type of information and why it is needed.
        </p>
      </LegalSection>

      <LegalSection title="8. YOUR CONTROLS">
        <p>Depending on the feature, you can:</p>
        <ul className="list-disc space-y-2 pl-6 marker:text-[var(--text-primary)]">
          <li>Edit your pet profile.</li>
          <li>Edit or ask Furvise to forget remembered details where that control is supported.</li>
          <li>Download a copy of your Furvise data.</li>
          <li>Delete your Furvise account.</li>
          <li>Manage your membership and billing controls.</li>
          <li>Contact us with a privacy or support question.</li>
        </ul>
      </LegalSection>

      <LegalSection title="9. ACCOUNT DELETION">
        <p>
          You can request account deletion through Furvise&apos;s Data &amp; Privacy settings. Account deletion is intended
          to remove the Furvise data associated with your account. Limited records may be retained when reasonably
          necessary for legal, billing, fraud-prevention, or security purposes. Copies in provider backups or logs
          may take additional time to expire under those providers&apos; normal retention processes.
        </p>
      </LegalSection>

      <LegalSection title="10. CHILDREN">
        <p>
          Furvise is not intentionally directed to children. If you believe a child has provided personal information
          to Furvise without appropriate permission, contact us so we can review and address it.
        </p>
      </LegalSection>

      <LegalSection title="11. CHANGES TO THIS POLICY">
        <p>
          We may update this policy as Furvise changes or as legal requirements evolve. We will post the updated
          policy here and revise the last updated date when we make material changes.
        </p>
      </LegalSection>

      <LegalSection title="12. CONTACT">
        <p>
          Questions about this policy or your information can be sent to{" "}
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
