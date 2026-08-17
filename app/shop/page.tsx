"use client";

import Image, { getImageProps } from "next/image";

import { AppPage } from "../components/app-page";
import { useRequireConfirmedSupabaseAuth } from "../lib/auth-session";

const {
  props: { srcSet: desktopArtworkSrcSet },
} = getImageProps({
  alt: "",
  height: 800,
  sizes: "100vw",
  src: "/images/products_page/comingsoon_bg.jpg",
  width: 1200,
});

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
        <picture className="pointer-events-none absolute inset-0" data-ui="products-coming-soon-artwork">
          <source media="(min-width: 1024px)" srcSet={desktopArtworkSrcSet} />
          <Image
            alt=""
            className="object-cover object-center translate-y-[3%] scale-[1.02] lg:translate-y-0 lg:scale-100"
            fetchPriority="high"
            fill
            sizes="100vw"
            src="/images/products_page/products_mobile.jpg"
          />
        </picture>
        <div aria-hidden="true" className="pointer-events-none absolute -left-16 -top-16 z-[1] h-[68%] w-[88%] rounded-full bg-[color-mix(in_srgb,var(--surface-primary)_92%,transparent)] blur-3xl lg:hidden" />

        <div className="relative z-10 flex min-h-[calc(100svh-4.25rem-var(--mobile-nav-clearance))] items-start px-6 pb-6 pt-8 sm:px-10 sm:pt-10 lg:min-h-[calc(100svh-7.25rem)] lg:items-center lg:px-[clamp(4rem,10vw,10rem)] lg:py-16">
          <div className="max-w-[360px] lg:max-w-[520px] xl:max-w-[580px]">
            <p className="inline-flex min-h-7 items-center rounded-full border border-[color-mix(in_srgb,var(--text-primary)_18%,transparent)] bg-[color-mix(in_srgb,var(--surface-primary)_76%,transparent)] px-3 text-[0.65rem] font-bold uppercase tracking-[0.2em] text-[var(--text-primary)] backdrop-blur-sm">
              Coming soon
            </p>
            <h1
              className="mt-3 text-[clamp(1.9rem,8.3vw,2.4rem)] font-bold leading-[1.02] tracking-[-0.04em] text-[var(--text-primary)] lg:mt-5 lg:text-[clamp(3.5rem,4.5vw,4.5rem)] lg:leading-[0.98]"
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
            <p aria-label="Personalized picks · Better comparisons · Smarter fit" className="mt-5 flex max-w-[15rem] flex-wrap gap-x-1.5 gap-y-0.5 text-[0.8rem] font-semibold leading-5 tracking-[0.01em] text-[var(--text-secondary)] lg:mt-6 lg:max-w-none lg:text-sm">
              <span aria-hidden="true" className="whitespace-nowrap">Personalized picks</span>
              <span aria-hidden="true" className="whitespace-nowrap"><span className="mr-1 text-[var(--accent-sage)]">·</span>Better comparisons</span>
              <span aria-hidden="true" className="whitespace-nowrap"><span className="mr-1 text-[var(--accent-sage)]">·</span>Smarter fit</span>
            </p>
          </div>
        </div>
      </section>
    </AppPage>
  );
}
