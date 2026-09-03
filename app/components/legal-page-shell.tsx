"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useConfirmedSupabaseAuth } from "../lib/auth-session";
import { appPageContainer } from "./product-primitives";

type LegalPageLink = {
  href: string;
  label: string;
  signedInOnly?: boolean;
};

type LegalPageShellProps = {
  children: ReactNode;
  links: LegalPageLink[];
};

export function LegalPageShell({ children, links }: LegalPageShellProps) {
  const router = useRouter();
  const { status } = useConfirmedSupabaseAuth();

  function goBack() {
    if (window.history.length > 1) router.back();
    else router.push("/");
  }

  const visibleLinks = links.filter((link) => !link.signedInOnly || status === "signedIn");

  return (
    <div className="min-h-dvh w-full overflow-x-hidden bg-[var(--surface-page)] text-[var(--text-primary)]">
      <header className="border-b border-[var(--line)] bg-[var(--surface-page)] pt-[env(safe-area-inset-top)]">
        <div className={`${appPageContainer} flex h-[72px] items-center justify-between`} data-legal-header-rail="">
          <Link
            aria-label="Furvise home"
            className="inline-flex min-h-11 items-center rounded-[var(--radius-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-page)]"
            href="/"
          >
            <Image
              alt=""
              aria-hidden="true"
              className="h-auto w-[124px] sm:w-36"
              height={800}
              priority
              sizes="(max-width: 639px) 124px, 144px"
              src="/brand/furvise-logo.svg"
              unoptimized
              width={3200}
            />
          </Link>
          <button
            className="inline-flex min-h-11 items-center rounded-[var(--radius-sm)] px-2 text-[0.8125rem] font-semibold tracking-[0.04em] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-page)]"
            onClick={goBack}
            type="button"
          >
            ← Back
          </button>
        </div>
      </header>

      <main className={`${appPageContainer} pb-[calc(5rem+env(safe-area-inset-bottom))] pt-12 sm:pb-24 sm:pt-16 lg:pb-28 lg:pt-20`}>
        <article className="max-w-[840px] font-sans" data-legal-article="">
          {children}

          <footer className="mt-16 border-t border-[var(--line)] pt-7 sm:mt-20 sm:pt-8">
            <nav aria-label="Legal page links" className="flex flex-wrap gap-x-8 gap-y-2">
              {visibleLinks.map((link) => (
                <Link
                  className="inline-flex min-h-11 items-center rounded-[var(--radius-sm)] text-sm font-semibold text-[var(--text-secondary)] underline-offset-4 transition-colors hover:text-[var(--text-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-page)]"
                  href={link.href}
                  key={link.href}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </footer>
        </article>
      </main>
    </div>
  );
}

export function LegalPageHeader({ intro, title }: { intro: string; title: string }) {
  return (
    <header>
      <p className="app-page-eyebrow">Legal</p>
      <h1 className="mt-2 max-w-full font-display text-[clamp(2.75rem,11vw,3rem)] font-bold leading-[0.98] tracking-[-0.018em] text-[var(--text-primary)] [overflow-wrap:anywhere] md:text-[clamp(3.25rem,4.2vw,4rem)]">{title}</h1>
      <p className="mt-4 max-w-[700px] font-sans text-[1.0625rem] leading-[1.6] text-[var(--text-secondary)] sm:text-lg">{intro}</p>
      <p className="mt-6 font-sans text-sm leading-[1.5] text-[var(--text-muted)]">Last updated: September 2026</p>
      <div aria-hidden="true" className="mt-11 border-t border-[var(--line)] sm:mt-12" />
    </header>
  );
}

export function LegalSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="pt-12 sm:pt-14 lg:pt-16">
      <h2 className="font-display text-[clamp(1.375rem,6vw,1.625rem)] font-bold leading-none tracking-[-0.012em] text-[var(--text-primary)] [overflow-wrap:anywhere] md:text-[clamp(1.625rem,2.2vw,1.875rem)]">{title}</h2>
      <div className="mt-5 space-y-4 font-sans text-base leading-[1.72] text-[var(--text-secondary)] sm:text-[1.0625rem]">{children}</div>
    </section>
  );
}
