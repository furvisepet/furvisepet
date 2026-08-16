"use client";

import Image from "next/image";

import { AppPage } from "../components/app-page";
import { useRequireConfirmedSupabaseAuth } from "../lib/auth-session";

export default function ShopPage() {
  const { status: authStatus } = useRequireConfirmedSupabaseAuth();
  if (authStatus !== "signedIn") return <AppPage layout="focused" shell="wide">{null}</AppPage>;

  return (
    <AppPage layout="focused" shell="wide">
      <section
        aria-labelledby="products-coming-soon-title"
        className="relative left-1/2 -mt-8 min-h-[calc(100svh-4.25rem-var(--mobile-nav-clearance))] w-dvw -translate-x-1/2 overflow-hidden bg-[var(--surface-primary)] sm:-mt-12 lg:-mt-14 lg:min-h-[calc(100svh-7.25rem)]"
        data-ui="products-coming-soon-hero"
      >
        <Image
          alt=""
          className="origin-bottom-right scale-[1.25] object-contain object-bottom lg:scale-100 lg:object-cover lg:object-center"
          fill
          priority
          sizes="100vw"
          src="/images/products_page/comingsoon_bg.jpg"
        />
        <div aria-hidden="true" className="pointer-events-none absolute -inset-x-8 -top-8 h-[62%] bg-[color-mix(in_srgb,var(--surface-primary)_92%,transparent)] blur-2xl lg:hidden" />

        <div className="relative z-10 flex min-h-[calc(100svh-4.25rem-var(--mobile-nav-clearance))] items-start px-6 pb-6 pt-8 sm:px-10 sm:pt-10 lg:min-h-[calc(100svh-7.25rem)] lg:items-center lg:px-[clamp(4rem,10vw,10rem)] lg:py-16">
          <div className="max-w-[360px] lg:max-w-[520px] xl:max-w-[580px]">
            <p className="inline-flex min-h-7 items-center rounded-full border border-[color-mix(in_srgb,var(--text-primary)_18%,transparent)] bg-[color-mix(in_srgb,var(--surface-primary)_76%,transparent)] px-3 text-[0.65rem] font-bold uppercase tracking-[0.2em] text-[var(--text-primary)] backdrop-blur-sm">
              Coming soon
            </p>
            <h1
              className="mt-3 text-[clamp(2.15rem,9.5vw,2.75rem)] font-bold leading-[1.02] tracking-[-0.04em] text-[var(--text-primary)] lg:mt-5 lg:text-[clamp(3.5rem,4.5vw,4.5rem)] lg:leading-[0.98]"
              id="products-coming-soon-title"
            >
              A smarter way to choose for your pet.
            </h1>
            <p className="mt-4 text-[0.95rem] leading-6 text-[var(--text-secondary)] lg:mt-6 lg:max-w-[500px] lg:text-lg lg:leading-8 xl:max-w-[560px]">
              Furvise is building personalized product intelligence around your pet&rsquo;s needs, routines, preferences, and care history.
            </p>
            <p className="mt-4 text-[0.95rem] font-semibold leading-6 text-[var(--text-primary)] lg:mt-5 lg:max-w-[480px] lg:text-lg lg:leading-7 xl:max-w-[520px]">
              Recommendations that understand the pet, not just the product.
            </p>
            <p className="mt-5 text-[0.8rem] font-semibold leading-5 tracking-[0.01em] text-[var(--text-secondary)] lg:mt-6 lg:text-sm">
              Personalized picks <span aria-hidden="true" className="mx-1 text-[var(--accent-sage)]">·</span> Better comparisons <span aria-hidden="true" className="mx-1 text-[var(--accent-sage)]">·</span> Smarter fit
            </p>
          </div>
        </div>
      </section>
    </AppPage>
  );
}
