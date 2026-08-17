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
        className="fixed inset-x-0 bottom-0 top-[4.25rem] overflow-hidden bg-[var(--surface-primary)] lg:top-[7.25rem]"
        data-ui="products-coming-soon-hero"
      >
        <h1 id="products-coming-soon-title" className="sr-only">
          Products coming soon
        </h1>

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
      </section>
    </AppPage>
  );
}