"use client";

import { AppPage } from "../components/app-page";
import { PageHeader } from "../components/product-primitives";
import { useRequireConfirmedSupabaseAuth } from "../lib/auth-session";

export default function ShopPage() {
  const { status: authStatus } = useRequireConfirmedSupabaseAuth();
  if (authStatus !== "signedIn") return <AppPage layout="focused" shell="wide">{null}</AppPage>;

  return (
    <AppPage layout="focused" shell="wide">
      <div className="flex min-h-[min(68vh,640px)] w-full items-center py-10 sm:py-16">
        <section className="w-full rounded-[28px] border border-[var(--line)] bg-[var(--surface-primary)] p-4 shadow-[var(--shadow-soft)] md:p-6 sm:px-10 sm:py-14">
          <PageHeader
            eyebrow="Coming soon"
            mobileTitleSize="compact"
            title="Products"
            supportingText="Smarter picks for your pet are coming."
          />
          <p className="mt-6 max-w-[600px] text-base leading-7 text-[var(--text-secondary)] sm:text-lg">
            Furvise is building a better way to discover products around your pet&apos;s needs, routines, and care history.
          </p>
        </section>
      </div>
    </AppPage>
  );
}
