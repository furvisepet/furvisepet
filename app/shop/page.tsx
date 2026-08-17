"use client";

import { getImageProps } from "next/image";

import { AppPage } from "../components/app-page";
import { useRequireConfirmedSupabaseAuth } from "../lib/auth-session";

export default function ShopPage() {
  const { status: authStatus } = useRequireConfirmedSupabaseAuth();

  if (authStatus !== "signedIn") {
    return (
      <AppPage layout="focused" shell="wide">
        {null}
      </AppPage>
    );
  }

  const mobileImage = getImageProps({
    alt: "",
    src: "/images/products_page/products_mobile.png",
    width: 1080,
    height: 1920,
    sizes: "100vw",
  }).props;

  const desktopImage = getImageProps({
    alt: "",
    src: "/images/products_page/products_desktop.png",
    width: 1792,
    height: 1024,
    sizes: "100vw",
  }).props;

  return (
    <AppPage layout="focused" shell="wide">
      <section
        aria-labelledby="products-coming-soon-title"
        className="relative left-1/2 -mt-8 min-h-[calc(100svh-4.25rem-var(--mobile-nav-clearance))] w-dvw -translate-x-1/2 overflow-hidden bg-[var(--surface-primary)] sm:-mt-12 lg:-mt-14 lg:min-h-[calc(100svh-7.25rem)]"
        data-ui="products-coming-soon-hero"
      >
        <picture className="absolute inset-0">
          <source
            media="(min-width: 1024px)"
            srcSet={desktopImage.srcSet}
            sizes={desktopImage.sizes}
          />

          <img
            {...mobileImage}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover object-center"
          />
        </picture>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-[34%] bg-gradient-to-b from-[var(--surface-primary)] to-transparent opacity-75 lg:hidden"
        />

        <div className="relative z-10 flex min-h-[calc(100svh-4.25rem-var(--mobile-nav-clearance))] items-start px-5 pt-6 sm:px-8 sm:pt-8 lg:min-h-[calc(100svh-7.25rem)] lg:items-end lg:px-[clamp(3rem,7vw,8rem)] lg:pb-14">
          <div className="max-w-[330px] rounded-[1.35rem] bg-[color-mix(in_srgb,var(--surface-primary)_82%,transparent)] p-4 shadow-[var(--shadow-surface-1)] backdrop-blur-md sm:max-w-[360px] sm:p-5 lg:max-w-[520px] lg:rounded-[1.6rem] lg:p-7">
            <h1
              id="products-coming-soon-title"
              className="text-[1.55rem] font-bold leading-[1.05] tracking-[-0.035em] text-[var(--text-primary)] sm:text-[1.8rem] lg:text-[2.5rem]"
            >
              A smarter way to choose for your pet.
            </h1>

            <p className="mt-3 text-[0.88rem] leading-5 text-[var(--text-secondary)] sm:text-[0.95rem] sm:leading-6 lg:mt-4 lg:text-base lg:leading-7">
              Furvise is building a better way to find products that actually
              make sense for your pet.
            </p>

            <p className="mt-3 text-[0.8rem] font-medium leading-5 text-[var(--text-secondary)] sm:text-[0.88rem] lg:mt-4 lg:text-[0.95rem] lg:leading-6">
              Personalized picks, smarter comparisons, and recommendations
              shaped around your pet&apos;s needs, preferences, sensitivities,
              and care history.
            </p>
          </div>
        </div>
      </section>
    </AppPage>
  );
}