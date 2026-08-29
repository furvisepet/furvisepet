"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { NEW_PET_LOGIN_PATH, NEW_PET_ONBOARDING_PATH } from "../lib/auth-routing";
import { useConfirmedSupabaseAuth } from "../lib/auth-session";
import { activePetsOnly } from "../lib/pet-lifecycle";
import { formatPetDisplayName } from "../lib/petwise";
import { loadDogProfilesWithMemories, type DogProfileWithMemories } from "../lib/supabase";
import { AppFooter } from "./app-footer";
import { BrandMark } from "./brand-mark";
import { PageShell, PrimaryButton } from "./product-primitives";
import { SignedInHeader } from "./signed-in-header";

type HomepageMode = "loading" | "anonymous" | "no-pets" | "with-pet";
type VisibleHomepageMode = Exclude<HomepageMode, "loading">;

const CARE_EXAMPLE_ROWS = [
  ["Today", "Ate normally after dinner"],
  ["Yesterday", "Paw licking looked better"],
  ["Next Tuesday", "Vet appointment"],
] as const;

const VALUE_BEATS = [
  ["KEEP THE CONTEXT", "Furvise keeps questions, updates, and useful details connected to the same pet."],
  ["UPDATE WHEN SOMETHING CHANGES", "Add what matters when it happens. You do not need to journal every day."],
  ["HAVE THE STORY WHEN YOU NEED IT", "Look back through their history, ask with context, or prepare for a vet visit."],
] as const;

export function HomepageClient() {
  const auth = useConfirmedSupabaseAuth();
  const [petState, setPetState] = useState<{ pet: DogProfileWithMemories | null; userId: string }>({ pet: null, userId: "" });

  useEffect(() => {
    if (auth.status !== "signedIn" || !auth.user) return;
    let active = true;
    loadDogProfilesWithMemories(auth.user)
      .then((profiles) => {
        if (active) setPetState({ pet: activePetsOnly(profiles)[0] || null, userId: auth.user?.id || "" });
      })
      .catch(() => {
        if (active) setPetState({ pet: null, userId: auth.user?.id || "" });
      });
    return () => { active = false; };
  }, [auth.status, auth.user]);

  const activePet = auth.user?.id === petState.userId ? petState.pet : null;
  const mode: HomepageMode = auth.status === "loading"
    ? "loading"
    : auth.status === "signedOut"
      ? "anonymous"
      : petState.userId !== auth.user?.id
        ? "loading"
        : activePet
          ? "with-pet"
          : "no-pets";
  const petName = activePet ? formatPetDisplayName(activePet.name) : "";
  const visibleMode: VisibleHomepageMode = mode === "loading" ? "anonymous" : mode;

  return (
    <main className={`min-h-screen overflow-x-hidden bg-[var(--surface-page)] text-[var(--text-primary)] ${mode === "no-pets" || mode === "with-pet" ? "app-mobile-nav-clearance" : ""}`}>
      {mode === "no-pets" || mode === "with-pet" ? <SignedInHeader variant="homepage" /> : <PublicMarketingHeader />}
      <Hero activePet={activePet} mode={visibleMode} petName={petName} />
      <ValueBeats />
      <TrustLine />
      <FinalCallToAction activePet={activePet} mode={visibleMode} petName={petName} />
      <AppFooter showSignIn={visibleMode === "anonymous"} />
    </main>
  );
}

function PublicMarketingHeader() {
  return (
    <header className="border-b border-[var(--border-subtle)] bg-[var(--surface-page)]" data-ui="public-marketing-header">
      <PageShell className="flex min-h-[4.25rem] items-center justify-between gap-4 py-2 sm:min-h-[4.5rem]" preset="marketing">
        <Link aria-label="Furvise home" className="inline-flex min-h-11 min-w-11 items-center rounded-[var(--radius-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2" href="/">
          <span className="inline-flex [--brand-mark-size:1.625rem] sm:[--brand-mark-size:1.75rem]"><BrandMark priority size={26} /></span>
        </Link>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <Link className="hidden min-h-11 items-center rounded-full px-3 text-sm font-semibold text-[var(--ghost-action-foreground)] hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] sm:inline-flex" href="/login">Sign in</Link>
          <PrimaryButton className="homepage-primary-action min-h-11 px-4 sm:px-5" href={NEW_PET_LOGIN_PATH}>Get started</PrimaryButton>
        </div>
      </PageShell>
    </header>
  );
}

function Hero({ activePet, mode, petName }: { activePet: DogProfileWithMemories | null; mode: VisibleHomepageMode; petName: string }) {
  return (
    <PageShell className="grid items-center gap-10 pb-14 pt-10 sm:gap-12 sm:pb-16 sm:pt-14 lg:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)] lg:gap-16 lg:py-16" preset="marketing">
      <div className="min-w-0">
        <h1 className="homepage-display max-w-[680px] text-[2.65rem] leading-[1.02] sm:text-[3.4rem] lg:text-[3.75rem]">Furvise remembers your pet, so you don&apos;t start from zero.</h1>
        <p className="mt-5 max-w-[620px] text-lg leading-8 text-[var(--text-secondary)]">Ask questions, add updates when something changes, and keep their story together over time.</p>
        <HeroActions activePet={activePet} mode={mode} petName={petName} />
      </div>
      <PetContextExample />
    </PageShell>
  );
}

function HeroActions({ activePet, mode, petName }: { activePet: DogProfileWithMemories | null; mode: VisibleHomepageMode; petName: string }) {
  if (mode === "with-pet" && activePet) return <div className="mt-7 flex flex-wrap items-center gap-3"><MarketingPrimaryLink href="/dashboard">Go to Today</MarketingPrimaryLink><MarketingTextLink href={`/ask?pet=${encodeURIComponent(activePet.id)}`}>Ask about {petName}</MarketingTextLink></div>;
  if (mode === "no-pets") return <div className="mt-7"><MarketingPrimaryLink href={NEW_PET_ONBOARDING_PATH}>Add your pet</MarketingPrimaryLink></div>;
  return <div className="mt-7"><MarketingPrimaryLink href={NEW_PET_LOGIN_PATH}>Get started</MarketingPrimaryLink></div>;
}

function PetContextExample() {
  return (
    <aside aria-label="Illustrative Furvise pet memory example" className="mx-auto w-full max-w-[500px] rounded-[1.75rem] border border-[var(--line)] bg-[var(--surface-primary)] p-5 shadow-[var(--shadow-surface-1)] sm:p-7" data-ui="homepage-product-example">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Illustrative example</p>
      <div className="mt-4 border-b border-[var(--line)] pb-5"><h2 className="text-2xl font-semibold tracking-[-0.025em]">Mani</h2><p className="mt-1 text-sm text-[var(--text-secondary)]">A few things Furvise remembers</p></div>
      <dl className="divide-y divide-[var(--line)]">{CARE_EXAMPLE_ROWS.map(([date, note]) => <div className="grid gap-1 py-3.5 sm:grid-cols-[7rem_1fr]" key={date}><dt className="text-sm font-semibold text-[var(--text-muted)]">{date}</dt><dd className="leading-6">{note}</dd></div>)}</dl>
      <div className="mt-3 rounded-2xl bg-[var(--surface-supportive)] px-4 py-3.5 text-[var(--deep-forest)]"><span className="block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Ask Furvise</span><span className="mt-1 block font-semibold leading-6">What should I keep an eye on before the visit?</span></div>
    </aside>
  );
}

function ValueBeats() {
  return <section className="border-y border-[var(--line)] bg-[var(--surface-primary)]" data-ui="homepage-value-beats"><PageShell className="grid gap-8 py-14 sm:py-16 md:grid-cols-3 md:gap-10" preset="marketing">{VALUE_BEATS.map(([title, copy]) => <article className="border-t border-[var(--border-strong)] pt-5" key={title}><h2 className="text-sm font-bold tracking-[0.08em] text-[var(--deep-forest)]">{title}</h2><p className="mt-3 leading-7 text-[var(--text-secondary)]">{copy}</p></article>)}</PageShell></section>;
}

function TrustLine() {
  return <PageShell className="py-9 text-center sm:py-11" preset="marketing"><p className="text-sm leading-6 text-[var(--text-muted)]">Furvise helps organize pet care information and does not replace veterinary care.</p></PageShell>;
}

function FinalCallToAction({ activePet, mode, petName }: { activePet: DogProfileWithMemories | null; mode: VisibleHomepageMode; petName: string }) {
  const authenticatedWithPet = mode === "with-pet" && activePet;
  return (
    <section className="border-t border-[var(--line)] bg-[var(--surface-primary)]" data-ui="homepage-final-conversion">
      <PageShell className="py-16 text-center sm:py-20" preset="marketing">
        <h2 className="text-3xl font-semibold tracking-[-0.035em] sm:text-[2.5rem]">{authenticatedWithPet ? `Keep ${petName}'s story together.` : "Remember what matters."}</h2>
        <p className="mx-auto mt-3 max-w-xl text-lg leading-8 text-[var(--text-secondary)]">{authenticatedWithPet ? "Return whenever there is something worth remembering." : "Start with your pet. Furvise can keep the story from there."}</p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">{authenticatedWithPet ? <><MarketingPrimaryLink href="/dashboard">Go to Today</MarketingPrimaryLink><MarketingTextLink href={`/ask?pet=${encodeURIComponent(activePet.id)}`}>Ask about {petName}</MarketingTextLink></> : mode === "no-pets" ? <MarketingPrimaryLink href={NEW_PET_ONBOARDING_PATH}>Add your pet</MarketingPrimaryLink> : <MarketingPrimaryLink href={NEW_PET_LOGIN_PATH}>Get started</MarketingPrimaryLink>}</div>
      </PageShell>
    </section>
  );
}

function MarketingPrimaryLink({ children, href }: { children: React.ReactNode; href: string }) {
  return <PrimaryButton className="homepage-primary-action px-6" href={href}>{children}</PrimaryButton>;
}

function MarketingTextLink({ children, href }: { children: React.ReactNode; href: string }) {
  return <Link className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-[var(--ghost-action-foreground)] underline-offset-4 hover:bg-[var(--surface-hover)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" href={href}>{children}</Link>;
}
