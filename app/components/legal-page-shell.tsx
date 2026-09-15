"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useConfirmedSupabaseAuth } from "../lib/auth-session";
import { appPageContainer, PageHeader } from "./product-primitives";
import { PublicPageHeader } from "./homepage-client";
import { SiteFooter } from "./site-footer";

type LegalPageLink = { href: string; label: string; signedInOnly?: boolean };

export function LegalPageShell({ children, links }: { children: ReactNode; links: LegalPageLink[] }) {
  const { status } = useConfirmedSupabaseAuth();
  const contextualLinks = links.filter(link => link.signedInOnly && status === "signedIn");
  return (
    <div className="public-page min-h-dvh w-full bg-[var(--surface-page)] text-[var(--text-primary)]">
      <PublicPageHeader />
      <main className={`${appPageContainer} pb-16 pt-8 sm:pt-12 lg:pt-16`}>
        <article className="max-w-[840px] font-sans" data-legal-article="">
          {children}
          {contextualLinks.length ? <nav aria-label="Account links" className="mt-10">
            {contextualLinks.map(link => <Link className="inline-flex min-h-11 items-center text-sm underline underline-offset-4 focus-visible:ring-2" key={link.href} href={link.href}>{link.label}</Link>)}
          </nav> : null}
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}

export function LegalPageHeader({ intro, title }: { intro: string; title: string }) {
  return (
    <div>
      <PageHeader eyebrow="Legal" title={title} supportingText={intro} />
      <p className="text-sm leading-relaxed text-[var(--text-muted)]">Last updated: September 2026</p>
      <div aria-hidden="true" className="mt-8 border-t border-[var(--line)]" />
    </div>
  );
}

export function LegalSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="pt-10 sm:pt-12">
      <h2 className="app-section-title">{title}</h2>
      <div className="site-reading-copy mt-5 space-y-4">{children}</div>
    </section>
  );
}
