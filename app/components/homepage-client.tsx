"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { NEW_PET_LOGIN_PATH, NEW_PET_ONBOARDING_PATH } from "../lib/auth-routing";
import { useConfirmedSupabaseAuth } from "../lib/auth-session";
import { formatPetDisplayName } from "../lib/petwise";
import { loadDogProfilesWithMemories, type DogProfileWithMemories } from "../lib/supabase";
import { AppHeader } from "./app-header";
import { AppFooter } from "./app-footer";
import { PageShell, PrimaryButton, SecondaryButton } from "./product-primitives";
import { SignedInHeader } from "./signed-in-header";

type HomepageMode = "loading" | "anonymous" | "no-pets" | "with-pet";

export function HomepageClient() {
  const auth = useConfirmedSupabaseAuth();
  const [petState, setPetState] = useState<{ pet: DogProfileWithMemories | null; userId: string }>({ pet: null, userId: "" });

  useEffect(() => {
    if (auth.status !== "signedIn" || !auth.user) return;
    let active = true;
    loadDogProfilesWithMemories(auth.user)
      .then((profiles) => {
        if (active) setPetState({ pet: profiles[0] || null, userId: auth.user?.id || "" });
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

  return (
    <main className={`min-h-screen bg-[var(--surface-page)] text-[var(--text-primary)] ${mode === "no-pets" || mode === "with-pet" ? "app-mobile-nav-clearance" : ""}`}>
      {mode === "no-pets" || mode === "with-pet"
        ? <SignedInHeader variant="homepage" />
        : <AppHeader authState={mode === "loading" ? "loading" : "anonymous"} brandHref="/" sticky variant="homepage" />}

      {mode === "loading" ? <HomepageLoading /> : (
        <>
          <Hero activePet={activePet} mode={mode} petName={petName} />
          <Benefits />
          <FinalCallToAction activePet={activePet} mode={mode} petName={petName} />
        </>
      )}

      <AppFooter showSignIn={mode === "anonymous"} />
    </main>
  );
}

function HomepageLoading() {
  return <PageShell className="min-h-[68vh] py-20" preset="marketing"><div className="h-12 max-w-[620px] animate-pulse rounded-2xl bg-[var(--selection)]" /><div className="mt-5 h-24 max-w-[540px] animate-pulse rounded-2xl bg-[var(--selection)]" /></PageShell>;
}

function Hero({ activePet, mode, petName }: { activePet: DogProfileWithMemories | null; mode: Exclude<HomepageMode, "loading">; petName: string }) {
  const authenticated = mode === "with-pet" || mode === "no-pets";
  return (
    <PageShell className="grid items-center gap-10 pb-16 pt-12 sm:pb-20 sm:pt-18 lg:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)] lg:gap-16 lg:py-24" preset="marketing">
      <div>
        <p className="mb-4 inline-flex rounded-full bg-[var(--surface-supportive)] px-3 py-1.5 text-sm font-semibold text-[var(--ghost-action-foreground)]">Pet care that is easier to remember</p>
        <h1 className="homepage-display max-w-[700px] text-[2.8rem] leading-[1.02] sm:text-[4rem]">Everything about your pet, in one caring place.</h1>
        <p className="mt-6 max-w-[650px] text-lg leading-8 text-[var(--text-secondary)]">Keep notes, routines, food changes, questions, and vet information together so you never have to remember everything on your own.</p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          {mode === "with-pet" && activePet ? (
            <><PrimaryLink href="/dashboard">Go to Today</PrimaryLink><SecondaryLink href={`/ask?pet=${encodeURIComponent(activePet.id)}`}>Ask about {petName}</SecondaryLink></>
          ) : mode === "no-pets" ? (
            <><PrimaryLink href={NEW_PET_ONBOARDING_PATH}>Add your pet</PrimaryLink><SecondaryLink href="#how-it-works">See how Furvise works</SecondaryLink></>
          ) : (
            <><PrimaryLink href={NEW_PET_LOGIN_PATH}>Add your pet</PrimaryLink><SecondaryLink href="#how-it-works">See how Furvise works</SecondaryLink></>
          )}
        </div>
        {!authenticated || mode === "no-pets" ? <p className="mt-4 text-sm font-medium text-[var(--text-tertiary)]">Takes about two minutes.</p> : null}
      </div>
      <CareSummary />
    </PageShell>
  );
}

function CareSummary() {
  const rows = [
    ["Today", "Ate normally after dinner"],
    ["Yesterday", "Paw licking looked better"],
    ["Next Tuesday", "Vet appointment"],
  ];
  return (
    <aside aria-label="Rocky care summary example" className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--card-background)] p-6 shadow-[0_18px_50px_var(--shadow)] sm:p-7">
      <div className="flex items-center gap-3 border-b border-[var(--line)] pb-5"><span aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface-supportive)] text-lg font-bold text-[var(--ghost-action-foreground)]">R</span><div><h2 className="text-2xl font-bold">Rocky</h2><p className="text-sm text-[var(--text-secondary)]">A few things worth remembering</p></div></div>
      <dl className="mt-2 divide-y divide-[var(--line)]">{rows.map(([date, note]) => <div className="grid gap-1 py-4 sm:grid-cols-[110px_1fr]" key={date}><dt className="text-sm font-semibold text-[var(--text-muted)]">{date}</dt><dd className="leading-6">{note}</dd></div>)}</dl>
      <Link className="mt-3 flex min-h-14 items-center justify-between rounded-2xl bg-[var(--surface-supportive)] px-4 font-semibold text-[var(--ghost-action-foreground)] transition hover:bg-[var(--surface-hover)]" href="/login"><span><span className="block text-xs uppercase tracking-[0.08em] text-[var(--text-secondary)]">Ask Furvise</span>What should I track before the visit?</span><span aria-hidden="true">→</span></Link>
    </aside>
  );
}

function Benefits() {
  const benefits = [
    ["Remember what changed", "Save food changes, symptoms, routines, products, and the small details that are easy to forget."],
    ["Ask when you are unsure", "Get practical guidance without repeating everything you have already recorded."],
    ["Prepare for the vet", "Turn your notes into a clear Vet Visit Brief you can print or show from your phone."],
  ];
  return <section className="bg-[var(--section-background)]" id="how-it-works"><PageShell className="py-16 sm:py-20" preset="marketing"><div className="grid gap-5 md:grid-cols-3">{benefits.map(([title, copy]) => <article className="rounded-2xl border border-[var(--line)] bg-[var(--card-background)] p-6 sm:p-7" key={title}><h2 className="text-2xl font-bold tracking-[-0.025em]">{title}</h2><p className="mt-3 leading-7 text-[var(--text-secondary)]">{copy}</p></article>)}</div></PageShell></section>;
}

function FinalCallToAction({ activePet, mode, petName }: { activePet: DogProfileWithMemories | null; mode: Exclude<HomepageMode, "loading">; petName: string }) {
  return <PageShell className="py-16 sm:py-20" preset="marketing"><section><div className="rounded-[1.75rem] bg-[var(--surface-supportive)] px-6 py-10 sm:flex sm:items-center sm:justify-between sm:gap-10 sm:px-10"><div><h2 className="text-3xl font-bold tracking-[-0.03em]">{mode === "with-pet" ? `Ready when ${petName} needs you.` : "Start with your pet's name."}</h2><p className="mt-3 text-lg text-[var(--text-secondary)]">{mode === "with-pet" ? "Keep today’s details close and easy to find." : "You can add more details whenever you are ready."}</p></div><div className="mt-6 flex shrink-0 flex-wrap gap-3 sm:mt-0">{mode === "with-pet" && activePet ? <><SecondaryLink href="/dashboard">Go to Today</SecondaryLink><SecondaryLink href={`/ask?pet=${encodeURIComponent(activePet.id)}`}>Ask about {petName}</SecondaryLink></> : <SecondaryLink href={mode === "no-pets" ? NEW_PET_ONBOARDING_PATH : NEW_PET_LOGIN_PATH}>Add your pet</SecondaryLink>}</div></div></section></PageShell>;
}

function PrimaryLink({ children, href }: { children: React.ReactNode; href: string }) {
  return <PrimaryButton className="px-6" href={href}>{children}</PrimaryButton>;
}

function SecondaryLink({ children, href }: { children: React.ReactNode; href: string }) {
  return <SecondaryButton href={href}>{children}</SecondaryButton>;
}
