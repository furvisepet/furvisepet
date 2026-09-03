"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useConfirmedSupabaseAuth } from "../lib/auth-session";
import { BrandMark } from "./brand-mark";

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
        <div className="mx-auto flex min-h-16 w-full max-w-[1120px] items-center justify-between px-5 sm:px-8 lg:px-10">
          <Link
            aria-label="Furvise home"
            className="inline-flex min-h-11 items-center rounded-[var(--radius-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-page)]"
            href="/"
          >
            <BrandMark />
          </Link>
          <button
            className="min-h-11 rounded-[var(--radius-sm)] px-3 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-page)]"
            onClick={goBack}
            type="button"
          >
            ← Back
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1120px] px-5 py-12 sm:px-8 sm:py-16 lg:px-10 lg:py-20">
        <article className="max-w-[820px]">
          {children}

          <footer className="mt-16 border-t border-[var(--line)] pt-7 sm:mt-20">
            <nav aria-label="Legal page links" className="flex flex-wrap gap-x-7 gap-y-2">
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
      <h1 className="app-page-title mt-2">{title}</h1>
      <p className="app-page-subtitle mt-4 max-w-[760px]">{intro}</p>
      <p className="mt-5 text-[0.9375rem] leading-6 text-[var(--text-secondary)]">Last updated: September 2026</p>
      <div aria-hidden="true" className="mt-10 border-t border-[var(--line)] sm:mt-12" />
    </header>
  );
}

export function LegalSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="pt-11 sm:pt-14">
      <h2 className="app-section-title">{title}</h2>
      <div className="mt-5 space-y-4 text-[1.0625rem] leading-[1.72] text-[var(--text-secondary)]">{children}</div>
    </section>
  );
}
