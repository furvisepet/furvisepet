"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { buildLoginHref, NEW_PET_LOGIN_PATH, NEW_PET_ONBOARDING_PATH } from "../lib/auth-routing";
import { useConfirmedSupabaseAuth } from "../lib/auth-session";
import { MOBILE_NAVIGATION_ITEMS, NAVIGATION_ICON_ASSETS } from "../lib/navigation/mobile-navigation";
import { activePetsOnly } from "../lib/pet-lifecycle";
import { loadDogProfilesWithMemories, type DogProfileWithMemories } from "../lib/supabase";

type HomepageMode = "loading" | "anonymous" | "no-pets" | "with-pet";
type VisibleHomepageMode = Exclude<HomepageMode, "loading">;
type StoryActionDestination = "ask" | "history" | "pets" | "primary" | "today";
type HomepageStoryArt = "cat" | "flamingo" | "heron" | "hummingbird";

const HOMEPAGE_STORY_ART = {
  cat: { height: 1536, sizes: "(min-width: 1600px) 768px, (min-width: 1024px) 48vw, 94vw", src: "/images/cat.png", width: 1024 },
  flamingo: { height: 1536, sizes: "(min-width: 1600px) 768px, (min-width: 1024px) 48vw, 92vw", src: "/images/flamingo.png", width: 1024 },
  heron: { height: 1285, sizes: "(min-width: 1600px) 832px, (min-width: 1024px) 52vw, 90vw", src: "/images/heron.png", width: 1224 },
  hummingbird: { height: 1024, sizes: "(min-width: 1600px) 768px, (min-width: 1024px) 48vw, 96vw", src: "/images/hummingbird.png", width: 1536 },
} as const;

const HOMEPAGE_DESKTOP_NAVIGATION = [
  { href: "/dashboard", label: "Today" },
  { href: "/pets", label: "Pets" },
  { href: "/care-log", label: "History" },
  { href: "/ask", label: "Ask" },
] as const;

const HOMEPAGE_MOBILE_NAVIGATION = [
  { ...MOBILE_NAVIGATION_ITEMS[0], href: "/dashboard", label: "Today" },
  MOBILE_NAVIGATION_ITEMS[1],
  MOBILE_NAVIGATION_ITEMS[2],
  MOBILE_NAVIGATION_ITEMS[3],
  { asset: NAVIGATION_ICON_ASSETS.more, href: "/account", label: "Account", tab: "more" },
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
  const visibleMode: VisibleHomepageMode = mode === "loading" ? "anonymous" : mode;
  const signedIn = mode === "with-pet" || mode === "no-pets";

  return (
    <div className="homepage-site min-h-screen overflow-x-hidden" data-authenticated={signedIn ? "true" : "false"} data-ui="marketing-homepage">
      <PublicMarketingHeader mode={mode} />
      <main className="homepage-dark-world" data-marketing-surface="dark" data-ui="homepage-story-main">
        <EditorialComposition art="heron" id="remembrance" side="right">
          <WhyWeExist mode={visibleMode} />
          <CompositionArt art="heron" priority />
        </EditorialComposition>
        <EditorialComposition art="flamingo" id="reality" side="left">
          <StoryChapter action="history" activePetId={activePet?.id} id="the-reality" mode={visibleMode} title={<>PETS CHANGE.<br />MEMORY FADES.</>}>
            A food change. A rough night. Something they kept doing. Something that finally got better. Months later, those little details are usually the ones you&apos;re trying hardest to remember.
          </StoryChapter>
          <CompositionArt art="flamingo" />
        </EditorialComposition>
        <EditorialComposition id="continuity" side="split">
          <StoryChapter action="pets" activePetId={activePet?.id} id="one-story" mode={visibleMode} title={<>ONE STORY.<br />NOT A PILE OF NOTES.</>}>
            Tell Furvise when something changes. Ask when you&apos;re unsure. It keeps what you share connected to the same pet, so the next time you come back, you&apos;re not starting over.
          </StoryChapter>
          <StoryChapter action="today" activePetId={activePet?.id} id="track-less" mode={visibleMode} title={<>YOU DON&apos;T HAVE TO<br />TRACK EVERYTHING.</>}>
            Furvise isn&apos;t another thing you need to update every day. Use it when something matters. We&apos;ll help keep the story from getting scattered.
          </StoryChapter>
        </EditorialComposition>
        <EditorialComposition art="cat" id="availability" side="right">
          <StoryChapter action="ask" activePetId={activePet?.id} id="when-needed" mode={visibleMode} title={<>WHEN YOU NEED IT,<br />IT&apos;S THERE.</>}>
            Look back at what changed. Ask without explaining everything again. Walk into a vet visit without trying to rebuild the last few months from memory.
          </StoryChapter>
          <CompositionArt art="cat" />
        </EditorialComposition>
        <EditorialComposition art="hummingbird" id="belief" side="left">
          <StoryChapter action="history" activePetId={activePet?.id} id="bigger-idea" mode={visibleMode} title={<>YOUR PET&apos;S STORY<br />SHOULDN&apos;T DISAPPEAR.</>}>
            The longer you care for a pet, the more their history matters. Furvise keeps that history useful, understandable, and close when you need it.
          </StoryChapter>
          <CompositionArt art="hummingbird" />
        </EditorialComposition>
        <FinalChapter mode={visibleMode} />
      </main>
      <MarketingFooter showSignIn={visibleMode === "anonymous"} signedIn={signedIn} />
      {signedIn ? <HomepageMobileNavigation /> : null}
    </div>
  );
}

function PublicMarketingHeader({ mode }: { mode: HomepageMode }) {
  const signedIn = mode === "with-pet" || mode === "no-pets";
  const anonymous = mode === "anonymous";

  return (
    <header className="homepage-marketing-header" data-marketing-surface="light" data-ui="public-marketing-header">
      <div className="homepage-wide-shell homepage-header-grid" data-ui="homepage-header-grid">
        <div className="homepage-header-brand-zone">
          <Link aria-label="Furvise home" className="homepage-brand-link" href="/">
            <Image alt="" aria-hidden="true" className="homepage-full-logo" height={800} priority sizes="144px" src="/brand/furvise-logo.svg" width={3200} />
          </Link>
        </div>
        <div className="homepage-header-navigation-zone" data-ui="homepage-header-navigation-zone">
          {signedIn ? (
            <nav aria-label="Homepage application navigation" className="homepage-desktop-navigation" data-ui="homepage-desktop-navigation">
              {HOMEPAGE_DESKTOP_NAVIGATION.map((item) => <Link className="homepage-header-text-link" href={item.href} key={item.href}>{item.label}</Link>)}
            </nav>
          ) : null}
        </div>
        <div className="homepage-header-actions" data-ui="homepage-header-actions">
          {signedIn ? <Link className="homepage-header-text-link" href="/account">Account</Link> : null}
          {anonymous ? <><Link className="homepage-header-text-link" href="/login">Sign in</Link><HeaderPrimaryLink href={NEW_PET_LOGIN_PATH}>Get started</HeaderPrimaryLink></> : null}
        </div>
      </div>
    </header>
  );
}

function WhyWeExist({ mode }: { mode: VisibleHomepageMode }) {
  return (
    <section className="homepage-story-chapter homepage-story-row homepage-story-hero" data-chapter="why-we-exist" id="why-we-exist">
      <div className="homepage-story-block">
        <h1 aria-label="Remember what matters." className="homepage-story-heading homepage-hero-heading"><span>REMEMBER</span><span>WHAT</span><span>MATTERS.</span></h1>
        <p className="homepage-story-body">Your pet has a whole life happening between vet visits. Most of it lives in your head, your camera roll, old messages, and random notes. Furvise is here to keep the important parts together.</p>
        <StoryAction mode={mode} />
      </div>
    </section>
  );
}

function EditorialComposition({ art, children, id, side }: { art?: HomepageStoryArt; children: React.ReactNode; id: string; side: "left" | "right" | "split" }) {
  return (
    <div className="homepage-editorial-composition" data-art={art} data-composition={id} data-side={side}>
      <div className="homepage-wide-shell homepage-editorial-grid">
        {children}
      </div>
    </div>
  );
}

function StoryChapter({ action, activePetId, children, id, mode, title }: { action: StoryActionDestination; activePetId?: string; children: React.ReactNode; id: string; mode: VisibleHomepageMode; title: React.ReactNode }) {
  return (
    <section className="homepage-story-chapter homepage-story-row" data-chapter={id} id={id}>
      <div className="homepage-story-block">
        <h2 className="homepage-story-heading">{title}</h2>
        <p className="homepage-story-body">{children}</p>
        <StoryAction activePetId={activePetId} destination={action} mode={mode} />
      </div>
    </section>
  );
}

function CompositionArt({ art, priority = false }: { art: HomepageStoryArt; priority?: boolean }) {
  const asset = HOMEPAGE_STORY_ART[art];

  return (
    <div aria-hidden="true" className={`homepage-story-art homepage-composition-art homepage-art-${art}`} data-art={art}>
      <Image alt="" aria-hidden="true" className="homepage-story-art-image" height={asset.height} loading={priority ? undefined : "lazy"} priority={priority} sizes={asset.sizes} src={asset.src} width={asset.width} />
    </div>
  );
}

function FinalChapter({ mode }: { mode: VisibleHomepageMode }) {
  return (
    <section className="homepage-story-chapter homepage-final-chapter" data-chapter="start" data-pace="full" data-ui="homepage-final-conversion">
      <div className="homepage-wide-shell homepage-story-inner">
        <div className="homepage-story-block">
          <h2 className="homepage-story-heading">START WITH<br />YOUR PET.</h2>
          <p className="homepage-story-body">You don&apos;t need to remember everything on day one. Just start.</p>
          <StoryAction mode={mode} />
          <p className="homepage-trust-line">Furvise helps organize pet care information and does not replace veterinary care.</p>
        </div>
      </div>
    </section>
  );
}

function StoryAction({ activePetId, destination = "primary", mode }: { activePetId?: string; destination?: StoryActionDestination; mode: VisibleHomepageMode }) {
  const action = resolveStoryAction({ activePetId, destination, mode });

  return <Link className="homepage-story-action" data-action={destination} data-variant={destination === "primary" ? "solid" : "outline"} href={action.href}>{action.label}</Link>;
}

function resolveStoryAction({ activePetId, destination, mode }: { activePetId?: string; destination: StoryActionDestination; mode: VisibleHomepageMode }) {
  if (destination === "primary" || destination === "today") {
    return mode === "anonymous"
      ? { href: NEW_PET_LOGIN_PATH, label: "Get started" }
      : mode === "no-pets"
        ? { href: NEW_PET_ONBOARDING_PATH, label: "Add your pet" }
        : { href: "/dashboard", label: "Go to Today" };
  }

  if (destination === "history") {
    return mode === "anonymous"
      ? { href: buildLoginHref("/care-log"), label: "View history" }
      : { href: "/care-log", label: "View history" };
  }

  if (destination === "pets") {
    return mode === "anonymous"
      ? { href: NEW_PET_LOGIN_PATH, label: "Your pets" }
      : { href: "/pets", label: "Your pets" };
  }

  const askPath = mode === "with-pet" && activePetId ? `/ask?pet=${encodeURIComponent(activePetId)}` : "/ask";
  return mode === "anonymous"
    ? { href: buildLoginHref("/ask"), label: "Ask Furvise" }
    : { href: askPath, label: "Ask Furvise" };
}

function HeaderPrimaryLink({ children, href }: { children: React.ReactNode; href: string }) {
  return <Link className="homepage-header-primary-link" href={href}>{children}</Link>;
}

function MarketingFooter({ showSignIn, signedIn }: { showSignIn: boolean; signedIn: boolean }) {
  const footerLinkClass = "homepage-footer-link";

  return (
    <footer className={signedIn ? "homepage-marketing-footer homepage-footer-mobile-clearance" : "homepage-marketing-footer"} data-marketing-surface="light" data-ui="homepage-marketing-footer">
      <div className="homepage-wide-shell homepage-footer-inner">
        <Link aria-label="Furvise home" className="homepage-footer-brand" href="/">
          <Image alt="" aria-hidden="true" className="homepage-full-logo homepage-footer-logo" height={800} loading="lazy" sizes="128px" src="/brand/furvise-logo.svg" width={3200} />
        </Link>
        <nav aria-label="Footer navigation" className="homepage-footer-navigation">
          <Link className={footerLinkClass} href="/privacy">Privacy</Link>
          <Link className={footerLinkClass} href="/terms">Terms</Link>
          {showSignIn ? <Link className={footerLinkClass} href="/login">Sign in</Link> : null}
        </nav>
      </div>
    </footer>
  );
}

function HomepageMobileNavigation() {
  return (
    <nav aria-label="Mobile navigation" className="homepage-mobile-navigation" data-ui="mobile-bottom-navigation">
      <div className="homepage-mobile-navigation-inner" data-ui="homepage-mobile-navigation-dock">
        {HOMEPAGE_MOBILE_NAVIGATION.map((item) => (
          <Link aria-label={item.label} className="homepage-mobile-navigation-link" href={item.href} key={item.href}>
            <span className="homepage-mobile-navigation-icon"><Image alt="" aria-hidden="true" className="object-contain" decoding="async" draggable={false} fill loading="lazy" sizes="44px" src={item.asset} /></span>
            <span>{item.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
