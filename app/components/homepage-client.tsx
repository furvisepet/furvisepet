"use client";

import Image from "next/image";
import Link from "next/link";
import { NEW_PET_LOGIN_PATH } from "../lib/auth-routing";
import { useConfirmedSupabaseAuth } from "../lib/auth-session";
import { MOBILE_NAVIGATION_ITEMS } from "../lib/navigation/mobile-navigation";
import { AccountUtility } from "./account-utility";

type HomepageMode = "loading" | "anonymous" | "no-pets" | "with-pet";
const HOMEPAGE_DESKTOP_NAVIGATION = [
  { href: "/today", label: "Today" },
  { href: "/pets", label: "Pets" },
  { href: "/history", label: "History" },
  { href: "/ask", label: "Ask" },
] as const;
const HOMEPAGE_MOBILE_NAVIGATION = [
  { ...MOBILE_NAVIGATION_ITEMS[0], href: "/today", label: "Today" },
  MOBILE_NAVIGATION_ITEMS[1], MOBILE_NAVIGATION_ITEMS[2], MOBILE_NAVIGATION_ITEMS[3],
] as const;

export function HomepageClient() {
  const auth = useConfirmedSupabaseAuth();
  const mode: HomepageMode = auth.status === "loading" ? "loading" : auth.status === "signedIn" ? "with-pet" : "anonymous";
  const visibleMode = mode === "loading" ? "anonymous" : mode;
  const signedIn = mode === "with-pet";
  return (
    <div className="homepage-site homepage-refined min-h-screen overflow-x-hidden" data-authenticated={signedIn ? "true" : "false"} data-ui="marketing-homepage">
      <PublicMarketingHeader email={auth.user?.email} mode={mode} />
      <main className="homepage-dark-world" data-marketing-surface="dark" data-ui="homepage-story-main">
        <section className="home-visual home-hero homepage-wide-shell" aria-labelledby="home-title">
          <div className="home-visual-copy">
            <p className="home-eyebrow">Furvise for pet owners</p>
            <h1 id="home-title" aria-label="Your pet’s care, in one place." className="home-display">Your pet’s care,<br />in one place.</h1>
            <p className="home-lead">Keep care notes, ask questions about past entries, and prepare a summary for your vet.</p>
          </div>
          <div className="home-visual-art home-heron" aria-hidden="true"><Image alt="" src="/images/heron.png" width={1224} height={1285} priority sizes="(min-width: 1024px) 45vw, 90vw" /></div>
        </section>

        <section id="how-it-works" className="home-visual home-explanation homepage-wide-shell" aria-labelledby="how-title">
          <div className="home-visual-copy">
            <h2 id="how-title" className="home-section-title">From a quick note<br />to your next vet visit.</h2>
            <div className="home-capabilities">
              <article><h3>Write down what happened</h3><p>A change in appetite, a new food, or how a walk went. Add a dated note in your own words. Each pet has a separate care history.</p></article>
              <article><h3>Ask about earlier notes</h3><p>“When did we change her food?” or “How has his weight changed?” Ask Furvise to help you find and compare what you’ve recorded.</p></article>
              <article><h3>Prepare a vet brief</h3><p>Bring relevant notes together in a summary. Check the details, then share it with your vet.</p></article>
            </div>
            <p id="context-title" className="home-care-note">Furvise helps organize information. It does not diagnose or replace veterinary care.</p>
          </div>
          <div className="home-visual-art home-cat" aria-hidden="true"><Image alt="" src="/images/cat.png" width={1024} height={1536} sizes="(min-width: 1024px) 40vw, 80vw" /></div>
        </section>

        <section className="home-progress homepage-wide-shell" aria-labelledby="progress-title">
          <h2 id="progress-title">Furvise is in public beta.</h2>
          <p>Ask can make mistakes or fail to answer. If something goes wrong, <a href="/contact" target="_blank" rel="noopener noreferrer">report a problem<span className="sr-only"> (opens in a new tab)</span></a>. You can follow our progress in the <Link href="/release-notes">release notes</Link>.</p>
        </section>
      </main>
      <MarketingFooter showSignIn={visibleMode === "anonymous"} signedIn={signedIn} />
      {signedIn ? <HomepageMobileNavigation /> : null}
    </div>
  );
}

function PublicMarketingHeader({ email, mode }: { email?: string | null; mode: HomepageMode }) {
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
              <PublicLinksMenu />
            </nav>
          ) : <nav aria-label="About Furvise" className="homepage-desktop-navigation"><Link className="homepage-header-text-link" href="/#how-it-works">How it works</Link><Link className="homepage-header-text-link" href="/release-notes">Release notes</Link><Link className="homepage-header-text-link" href="/contact">Contact</Link></nav>}
        </div>
        <div className="homepage-header-actions" data-ui="homepage-header-actions">
          <div className="homepage-mobile-menu"><PublicLinksMenu /></div>
          {signedIn ? <AccountUtility email={email} /> : null}
          {anonymous ? <><Link className="homepage-header-text-link" href="/login">Sign in</Link><HeaderPrimaryLink href={NEW_PET_LOGIN_PATH}>Get started</HeaderPrimaryLink></> : null}
        </div>
      </div>
    </header>
  );
}


function PublicLinksMenu() {
  return <details className="homepage-about-menu">
    <summary>About</summary>
    <nav aria-label="Furvise updates">
      <Link href="/#how-it-works">How it works</Link>
      <Link href="/release-notes">Release notes</Link>
      <Link href="/contact">Contact</Link>
    </nav>
  </details>;
}


function HeaderPrimaryLink({ children, href }: { children: React.ReactNode; href: string }) {
  return <Link className="homepage-header-primary-link" href={href}>{children}</Link>;
}

export function PublicPageHeader() {
  const auth = useConfirmedSupabaseAuth();
  const mode: HomepageMode = auth.status === "loading" ? "loading" : auth.status === "signedIn" ? "with-pet" : "anonymous";
  return <PublicMarketingHeader email={auth.user?.email} mode={mode} />;
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
          <Link className={footerLinkClass} href="/release-notes">Release notes</Link>
          <Link className={footerLinkClass} href="/contact">Contact us</Link>
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
