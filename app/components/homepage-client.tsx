"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { NEW_PET_LOGIN_PATH, NEW_PET_ONBOARDING_PATH } from "../lib/auth-routing";
import { useConfirmedSupabaseAuth } from "../lib/auth-session";
import { activePetsOnly } from "../lib/pet-lifecycle";
import { formatPetDisplayName } from "../lib/petwise";
import { loadDogProfilesWithMemories, type DogProfileWithMemories } from "../lib/supabase";
import { BrandMark } from "./brand-mark";
import { PageShell, PrimaryButton } from "./product-primitives";

type HomepageMode = "loading" | "anonymous" | "no-pets" | "with-pet";
type VisibleHomepageMode = Exclude<HomepageMode, "loading">;

const CARE_EXAMPLE_ROWS = [
  ["Today", "Ate normally after dinner"],
  ["Yesterday", "Paw licking looked better"],
  ["Next Tuesday", "Vet appointment"],
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
    <main className="homepage-dark-world min-h-screen overflow-x-hidden" data-ui="marketing-homepage">
      <PublicMarketingHeader mode={mode} />
      <Hero activePet={activePet} mode={visibleMode} petName={petName} />
      <ContextStory />
      <UpdateStory />
      <AskStory />
      <HistoryVetStory />
      <FinalCallToAction activePet={activePet} mode={visibleMode} petName={petName} />
      <MarketingFooter showSignIn={visibleMode === "anonymous"} />
    </main>
  );
}

function PublicMarketingHeader({ mode }: { mode: HomepageMode }) {
  return (
    <header className="bg-[var(--marketing-forest)]" data-marketing-surface="dark" data-ui="public-marketing-header">
      <PageShell className="flex min-h-[4.25rem] items-center justify-between gap-4 py-2 sm:min-h-[4.5rem]" preset="marketing">
        <Link aria-label="Furvise home" className="homepage-brand-lockup inline-flex min-h-11 min-w-11 items-center rounded-[var(--radius-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--marketing-forest)]" href="/">
          <span className="inline-flex [--brand-mark-size:1.625rem] sm:[--brand-mark-size:1.75rem]"><BrandMark priority size={26} /></span>
        </Link>
        <HomepageHeaderActions mode={mode} />
      </PageShell>
    </header>
  );
}

function HomepageHeaderActions({ mode }: { mode: HomepageMode }) {
  const actionRegionClass = "flex h-12 w-[11.5rem] shrink-0 items-center justify-end gap-1.5 sm:w-[13rem] sm:gap-2";
  const quietActionClass = "inline-flex min-h-11 items-center rounded-full px-2 text-sm font-semibold text-[var(--marketing-text)] hover:bg-[var(--marketing-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] sm:px-3";

  if (mode === "loading") {
    return <div aria-hidden="true" className={actionRegionClass} data-ui="homepage-header-actions" />;
  }

  if (mode === "with-pet" || mode === "no-pets") {
    return (
      <div className={actionRegionClass} data-ui="homepage-header-actions">
        <Link className={quietActionClass} data-ui="marketing-quiet-action" href="/account">Account</Link>
        <PrimaryButton className="homepage-primary-action min-h-11 px-3 sm:px-4" href={mode === "with-pet" ? "/dashboard" : NEW_PET_ONBOARDING_PATH}>{mode === "with-pet" ? "Go to Today" : "Add your pet"}</PrimaryButton>
      </div>
    );
  }

  return (
    <div className={actionRegionClass} data-ui="homepage-header-actions">
      <Link className={quietActionClass} data-ui="marketing-quiet-action" href="/login">Sign in</Link>
      <PrimaryButton className="homepage-primary-action min-h-11 px-3 sm:px-4" href={NEW_PET_LOGIN_PATH}>Get started</PrimaryButton>
    </div>
  );
}

function Hero({ activePet, mode, petName }: { activePet: DogProfileWithMemories | null; mode: VisibleHomepageMode; petName: string }) {
  return (
    <section className="homepage-hero bg-[var(--marketing-forest)]" data-marketing-surface="dark" data-ui="homepage-hero">
      <PageShell className="grid items-center gap-11 pb-16 pt-9 sm:gap-14 sm:pb-20 sm:pt-14 lg:grid-cols-[minmax(0,0.92fr)_minmax(480px,1.08fr)] lg:gap-16 lg:py-20" preset="marketing">
        <div className="min-w-0 lg:pb-8">
          <h1 className="homepage-display max-w-[660px] text-[2.8rem] leading-[0.98] tracking-[-0.048em] text-[var(--marketing-text)] sm:text-[4rem] lg:text-[4.75rem]">Furvise remembers your pet, so you don&apos;t start from zero.</h1>
          <p className="mt-6 max-w-[590px] text-lg leading-8 text-[var(--marketing-muted)] sm:text-xl">Ask questions, add updates when something changes, and keep their story together over time.</p>
          <HeroActions activePet={activePet} mode={mode} petName={petName} />
        </div>
        <HeroProductPanel />
      </PageShell>
    </section>
  );
}

function HeroActions({ activePet, mode, petName }: { activePet: DogProfileWithMemories | null; mode: VisibleHomepageMode; petName: string }) {
  if (mode === "with-pet" && activePet) return <div className="mt-8 flex flex-wrap items-center gap-3"><MarketingPrimaryLink href="/dashboard">Go to Today</MarketingPrimaryLink><MarketingTextLink href={`/ask?pet=${encodeURIComponent(activePet.id)}`}>Ask about {petName}</MarketingTextLink></div>;
  if (mode === "no-pets") return <div className="mt-8"><MarketingPrimaryLink href={NEW_PET_ONBOARDING_PATH}>Add your pet</MarketingPrimaryLink></div>;
  return <div className="mt-8"><MarketingPrimaryLink href={NEW_PET_LOGIN_PATH}>Get started</MarketingPrimaryLink></div>;
}

function HeroProductPanel() {
  return (
    <aside aria-label="Illustrative Furvise pet memory example" className="homepage-product-frame mx-auto w-full max-w-[590px] p-5 sm:p-7 lg:p-8" data-ui="homepage-product-example">
      <ProductWindowHeader detail="Mani's story, kept together" label="Today" />
      <div className="mt-8 grid gap-8 sm:grid-cols-[minmax(0,1fr)_minmax(190px,0.72fr)] sm:items-end">
        <div>
          <p className="homepage-product-kicker">Good evening</p>
          <h2 className="mt-2 text-[2rem] font-semibold tracking-[-0.035em]">Anything worth remembering?</h2>
          <div className="mt-7 divide-y divide-[var(--line)] border-y border-[var(--line)]">
            {CARE_EXAMPLE_ROWS.map(([date, note]) => <div className="grid gap-1 py-3.5" key={date}><p className="homepage-product-muted text-xs font-semibold">{date}</p><p className="text-[0.95rem] leading-6">{note}</p></div>)}
          </div>
        </div>
        <div className="rounded-[var(--radius-md)] bg-[var(--surface-supportive)] p-4">
          <p className="homepage-product-kicker">Ask about Mani</p>
          <p className="mt-2 font-semibold leading-6">What should I keep an eye on before the visit?</p>
          <p className="homepage-product-muted mt-4 text-xs leading-5">Mani&apos;s recent updates stay in view.</p>
        </div>
      </div>
      <IllustrativeLabel />
    </aside>
  );
}

function ContextStory() {
  return (
    <EditorialSection id="keep-context" title="Keep the context.">
      <p className="homepage-story-copy">Furvise keeps questions, updates, and useful details connected to the same pet.</p>
      <ContextHistoryVisual />
    </EditorialSection>
  );
}

function ContextHistoryVisual() {
  return (
    <div aria-label="Illustrative connected history for Mani" className="homepage-product-frame w-full p-5 sm:p-7" data-ui="context-history-example" role="group">
      <ProductWindowHeader detail="All of Mani's useful details" label="History" />
      <div className="mt-7 grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.68fr)]">
        <div className="relative border-l border-[var(--line)] pl-6">
          <TimelineNote date="Today" text="Ate normally after dinner" />
          <TimelineNote date="Yesterday" text="Paw licking looked better" />
          <TimelineNote date="Last week" text="Asked about preparing for the next visit" />
        </div>
        <div className="self-end border-t border-[var(--line)] pt-5 md:border-l md:border-t-0 md:pl-7 md:pt-0">
          <p className="homepage-product-kicker">Connected to Mani</p>
          <p className="mt-3 text-lg font-semibold leading-7">Questions and updates stay part of the same story.</p>
          <p className="homepage-product-muted mt-4 text-sm leading-6">Profile, history, and Ask remain connected.</p>
        </div>
      </div>
      <IllustrativeLabel />
    </div>
  );
}

function UpdateStory() {
  return (
    <section className="homepage-editorial-section homepage-light-story" data-marketing-surface="light" data-story-section="update" id="add-when-changed">
      <PageShell className="grid items-center gap-12 py-16 sm:py-20 lg:grid-cols-[minmax(480px,1.1fr)_minmax(0,0.9fr)] lg:gap-20 lg:py-28" preset="marketing">
        <div className="max-w-[510px] lg:order-2 lg:justify-self-end">
          <h2 className="homepage-story-title">Add it when something changes.</h2>
          <p className="homepage-story-copy">Add what matters when it happens. You do not need to journal every day.</p>
        </div>
        <div className="lg:order-1"><UpdateInteractionVisual /></div>
      </PageShell>
    </section>
  );
}

function UpdateInteractionVisual() {
  return (
    <div aria-label="Illustrative Furvise update interaction" className="homepage-product-frame w-full p-5 sm:p-7" data-ui="update-history-example" role="group">
      <ProductWindowHeader detail="A simple note, added when it matters" label="Add update" />
      <div className="mt-7 rounded-[var(--radius-md)] border border-[var(--input-border)] bg-[var(--surface-primary)] p-4 shadow-[inset_0_1px_0_var(--line)]">
        <p className="homepage-product-muted text-sm">What changed?</p>
        <p className="mt-3 leading-7">Mani ate normally after dinner and settled down.</p>
        <div className="mt-6 flex justify-end"><span className="inline-flex min-h-11 items-center rounded-full bg-[var(--deep-forest)] px-5 text-sm font-semibold text-[var(--warm-cream)]">Add update</span></div>
      </div>
      <div className="mt-6 border-t border-[var(--line)] pt-5">
        <p className="homepage-product-kicker">Previous entry</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-[7rem_1fr]"><p className="homepage-product-muted text-sm font-semibold">Yesterday</p><p className="leading-6">Paw licking looked better.</p></div>
      </div>
      <IllustrativeLabel />
    </div>
  );
}

function AskStory() {
  return (
    <EditorialSection id="ask-with-context" reverse title="Ask without starting over.">
      <p className="homepage-story-copy">Furvise already knows who you&apos;re asking about and can use the details you&apos;ve shared before.</p>
      <AskContextVisual />
    </EditorialSection>
  );
}

function AskContextVisual() {
  return (
    <div aria-label="Illustrative Ask interface with Mani selected" className="homepage-product-frame w-full overflow-hidden" data-ui="ask-context-example" role="group">
      <div className="grid md:grid-cols-[180px_minmax(0,1fr)]">
        <div className="border-b border-[var(--line)] bg-[var(--surface-supportive)] p-5 md:border-b-0 md:border-r">
          <p className="homepage-product-kicker">Ask</p>
          <div className="mt-5 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-primary)] p-3">
            <p className="text-sm font-semibold">Mani</p>
            <p className="homepage-product-muted mt-1 text-xs">Selected pet</p>
          </div>
          <p className="homepage-product-muted mt-5 text-xs leading-5">Profile and prior updates available</p>
        </div>
        <div className="p-5 sm:p-7">
          <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] pb-5">
            <div><p className="text-lg font-semibold">Ask about Mani</p><p className="homepage-product-muted mt-1 text-sm">Using Mani&apos;s profile and history</p></div>
            <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full bg-[var(--sage)]" />
          </div>
          <div className="ml-auto mt-8 max-w-[410px] rounded-[var(--radius-md)] bg-[var(--surface-supportive)] px-4 py-3.5">
            <p className="leading-6">What changed around the time Mani started licking his paw?</p>
          </div>
          <div className="mt-7 border-l-2 border-[var(--deep-forest)] pl-4">
            <p className="homepage-product-kicker">Context in view</p>
            <p className="homepage-product-muted mt-2 text-sm leading-6">Recent updates and Mani&apos;s saved details are ready to support the question.</p>
          </div>
          <IllustrativeLabel />
        </div>
      </div>
    </div>
  );
}

function HistoryVetStory() {
  return (
    <section className="homepage-editorial-section homepage-forest-raised" data-marketing-surface="dark" data-story-section="history-vet" id="history-and-vet">
      <PageShell className="grid items-center gap-12 py-16 sm:py-20 lg:grid-cols-[minmax(0,0.78fr)_minmax(520px,1.22fr)] lg:gap-20 lg:py-28" preset="marketing">
        <div className="max-w-[510px]">
          <h2 className="homepage-story-title">Have the story when you need it.</h2>
          <p className="homepage-story-copy">Look back through their history, ask with context, or prepare for a vet visit.</p>
          <p className="mt-8 max-w-md text-sm leading-6 text-[var(--marketing-subtle)]">Furvise helps organize pet care information and does not replace veterinary care.</p>
        </div>
        <HistoryVetVisual />
      </PageShell>
    </section>
  );
}

function HistoryVetVisual() {
  return (
    <div aria-label="Illustrative history and Vet Visit Brief preview" className="homepage-product-frame w-full p-5 sm:p-7" data-ui="history-vet-example" role="group">
      <ProductWindowHeader detail="From remembered details to a concise preview" label="Mani" />
      <div className="mt-7 grid gap-7 md:grid-cols-[minmax(0,0.9fr)_minmax(230px,1.1fr)]">
        <div className="border-b border-[var(--line)] pb-7 md:border-b-0 md:border-r md:pb-0 md:pr-7">
          <p className="homepage-product-kicker">Recent history</p>
          <div className="mt-4 space-y-4">
            <HistoryRow date="Today" text="Ate normally after dinner" />
            <HistoryRow date="Yesterday" text="Paw licking looked better" />
            <HistoryRow date="Next Tuesday" text="Vet appointment" />
          </div>
        </div>
        <div>
          <div className="flex items-start justify-between gap-4"><div><p className="homepage-product-kicker">Vet Visit Brief</p><h3 className="mt-2 text-xl font-semibold">Preview for Mani</h3></div><span className="rounded-full bg-[var(--surface-supportive)] px-3 py-1 text-xs font-semibold">Preview</span></div>
          <div className="mt-6 divide-y divide-[var(--line)] border-y border-[var(--line)] text-sm">
            <p className="py-3">Recent changes</p>
            <p className="py-3">Questions to bring</p>
            <p className="py-3">Care history</p>
          </div>
          <p className="homepage-product-muted mt-4 text-xs leading-5">A concise view of details already in Furvise.</p>
        </div>
      </div>
      <IllustrativeLabel />
    </div>
  );
}

function EditorialSection({ children, id, reverse = false, title }: { children: React.ReactNode; id: string; reverse?: boolean; title: string }) {
  const [copy, visual] = Array.isArray(children) ? children : [children];
  return (
    <section className="homepage-editorial-section bg-[var(--marketing-forest)]" data-marketing-surface="dark" data-story-section={id} id={id}>
      <PageShell className={`grid items-center gap-12 py-16 sm:py-20 lg:grid-cols-[minmax(0,0.82fr)_minmax(500px,1.18fr)] lg:gap-20 lg:py-28 ${reverse ? "lg:[&>*:first-child]:order-2 lg:[&>*:last-child]:order-1" : ""}`} preset="marketing">
        <div className={`max-w-[510px] ${reverse ? "lg:justify-self-end" : ""}`}>
          <h2 className="homepage-story-title">{title}</h2>
          {copy}
        </div>
        {visual}
      </PageShell>
    </section>
  );
}

function ProductWindowHeader({ detail, label }: { detail: string; label: string }) {
  return <div className="flex items-start justify-between gap-5 border-b border-[var(--line)] pb-5"><div><p className="text-xl font-semibold tracking-[-0.025em]">{label}</p><p className="homepage-product-muted mt-1 text-sm">{detail}</p></div><span className="inline-flex min-h-9 items-center rounded-full bg-[var(--surface-supportive)] px-3 text-xs font-semibold">Mani</span></div>;
}

function TimelineNote({ date, text }: { date: string; text: string }) {
  return <div className="relative pb-7 last:pb-0"><span aria-hidden="true" className="absolute -left-[1.73rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--surface-primary)] bg-[var(--deep-forest)]" /><p className="homepage-product-muted text-xs font-semibold">{date}</p><p className="mt-1 leading-6">{text}</p></div>;
}

function HistoryRow({ date, text }: { date: string; text: string }) {
  return <div><p className="homepage-product-muted text-xs font-semibold">{date}</p><p className="mt-1 text-sm leading-6">{text}</p></div>;
}

function IllustrativeLabel() {
  return <p className="homepage-product-muted mt-6 text-[0.6875rem] font-semibold uppercase tracking-[0.12em]">Illustrative example</p>;
}

function FinalCallToAction({ activePet, mode, petName }: { activePet: DogProfileWithMemories | null; mode: VisibleHomepageMode; petName: string }) {
  const authenticatedWithPet = mode === "with-pet" && activePet;
  return (
    <section className="bg-[var(--marketing-forest)]" data-marketing-surface="dark" data-ui="homepage-final-conversion">
      <PageShell className="py-24 text-center sm:py-32 lg:py-40" preset="marketing">
        <h2 className="homepage-display text-[2.75rem] leading-none tracking-[-0.045em] text-[var(--marketing-text)] sm:text-[4.5rem]">Remember what matters.</h2>
        <p className="mx-auto mt-6 max-w-xl text-lg leading-8 text-[var(--marketing-muted)]">Start with your pet. Furvise can keep the story from there.</p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">{authenticatedWithPet ? <><MarketingPrimaryLink href="/dashboard">Go to Today</MarketingPrimaryLink><MarketingTextLink href={`/ask?pet=${encodeURIComponent(activePet.id)}`}>Ask about {petName}</MarketingTextLink></> : mode === "no-pets" ? <MarketingPrimaryLink href={NEW_PET_ONBOARDING_PATH}>Add your pet</MarketingPrimaryLink> : <MarketingPrimaryLink href={NEW_PET_LOGIN_PATH}>Get started</MarketingPrimaryLink>}</div>
      </PageShell>
    </section>
  );
}

function MarketingFooter({ showSignIn }: { showSignIn: boolean }) {
  const footerLinkClass = "inline-flex min-h-11 items-center rounded-full px-2 text-[var(--marketing-muted)] underline-offset-4 hover:bg-[var(--marketing-hover)] hover:text-[var(--marketing-text)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]";

  return (
    <footer className="border-t border-[var(--marketing-line)] bg-[var(--marketing-forest)]" data-marketing-surface="dark" data-ui="homepage-marketing-footer">
      <PageShell className="flex flex-col gap-4 py-6 text-sm sm:flex-row sm:items-center sm:justify-between" preset="marketing">
        <Link aria-label="Furvise home" className="homepage-brand-lockup inline-flex w-fit min-h-11 items-center rounded-[var(--radius-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--marketing-forest)]" href="/">
          <span className="inline-flex [--brand-mark-size:1.5rem]"><BrandMark size={24} /></span>
        </Link>
        <nav aria-label="Footer navigation" className="flex min-h-11 items-center gap-1 sm:gap-3">
          <Link className={footerLinkClass} href="/privacy">Privacy</Link>
          <Link className={footerLinkClass} href="/terms">Terms</Link>
          {showSignIn ? <Link className={`${footerLinkClass} font-semibold text-[var(--marketing-text)]`} href="/login">Sign in</Link> : null}
        </nav>
      </PageShell>
    </footer>
  );
}

function MarketingPrimaryLink({ children, href }: { children: React.ReactNode; href: string }) {
  return <PrimaryButton className="homepage-primary-action px-6" href={href}>{children}</PrimaryButton>;
}

function MarketingTextLink({ children, href }: { children: React.ReactNode; href: string }) {
  return <Link className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-[var(--marketing-text)] underline-offset-4 hover:bg-[var(--marketing-hover)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" data-ui="marketing-quiet-action" href={href}>{children}</Link>;
}
