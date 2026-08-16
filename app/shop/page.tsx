"use client";

import Image from "next/image";

import comingSoonBackground from "../../public/images/products_page/comingsoon_bg.jpg";
import { AppPage } from "../components/app-page";
import { useRequireConfirmedSupabaseAuth } from "../lib/auth-session";

export default function ShopPage() {
  const { status: authStatus } = useRequireConfirmedSupabaseAuth();
  if (authStatus !== "signedIn") return <AppPage layout="focused" shell="wide">{null}</AppPage>;

  return (
    <AppPage layout="focused" shell="wide">
      <div className="w-full py-4 sm:py-6">
        <section
          aria-labelledby="products-coming-soon-title"
          className="relative isolate w-full overflow-hidden rounded-[var(--radius-xl)] border border-[var(--line)] bg-[var(--surface-primary)] shadow-[var(--shadow-surface-2)] sm:min-h-[clamp(560px,calc(100svh-10rem),720px)]"
          data-ui="products-coming-soon-hero"
        >
          <div className="relative z-10 flex items-start px-6 pb-5 pt-9 sm:min-h-[clamp(560px,calc(100svh-10rem),720px)] sm:items-center sm:px-10 sm:py-16 md:px-14 lg:px-16">
            <div className="max-w-[610px] sm:max-w-[56%] lg:max-w-[590px]">
              <p className="inline-flex min-h-8 items-center rounded-full border border-[color-mix(in_srgb,var(--text-primary)_18%,transparent)] bg-[color-mix(in_srgb,var(--surface-primary)_72%,transparent)] px-3.5 text-[0.7rem] font-bold uppercase tracking-[0.2em] text-[var(--text-primary)] backdrop-blur-sm">
                Coming soon
              </p>
              <h1
                className="mt-5 text-[clamp(2.65rem,10vw,3.5rem)] font-bold leading-[0.98] tracking-[-0.045em] text-[var(--text-primary)] sm:text-[clamp(3.25rem,5.5vw,4.75rem)]"
                id="products-coming-soon-title"
              >
                <span className="block">A smarter way to choose</span>
                <span className="block">for your pet.</span>
              </h1>
              <p className="mt-6 max-w-[570px] text-[1.02rem] leading-7 text-[var(--text-secondary)] sm:text-lg sm:leading-8">
                Furvise is building personalized product intelligence around your pet&apos;s needs, routines, preferences, and care history, so choosing what actually fits becomes easier.
              </p>
              <p className="mt-5 max-w-[520px] text-base font-semibold leading-7 text-[var(--text-primary)] sm:text-lg">
                Recommendations that understand the pet, not just the product.
              </p>
              <p className="mt-6 text-sm font-semibold tracking-[0.015em] text-[var(--text-secondary)]">
                Personalized picks <span aria-hidden="true" className="mx-1.5 text-[var(--accent-sage)]">·</span> Better comparisons <span aria-hidden="true" className="mx-1.5 text-[var(--accent-sage)]">·</span> Smarter fit
              </p>
            </div>
          </div>

          <div className="relative h-[360px] w-full sm:absolute sm:inset-0 sm:h-full">
            <Image
              alt=""
              className="object-cover object-[88%_center] sm:object-center"
              fill
              priority
              sizes="(max-width: 639px) 100vw, 1180px"
              src={comingSoonBackground}
            />
          </div>
        </section>
      </div>
    </AppPage>
  );
}
