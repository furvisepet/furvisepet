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
            <p className="home-eyebrow">A place for your pet’s story</p>
            <h1 id="home-title" aria-label="Remember what matters." className="home-display">REMEMBER<br />WHAT MATTERS.</h1>
            <p className="home-lead">One place for your pet’s notes, questions, and care history.</p>
            <p className="home-copy">From an ordinary day to a change you want to remember. Keep the details together, so they’re there when you need them.</p>
          </div>
          <div className="home-visual-art home-heron" aria-hidden="true"><Image alt="" src="/images/heron.png" width={1224} height={1285} priority sizes="(min-width: 1024px) 52vw, 90vw" /></div>
          <p className="home-hero-footnote">Built around the life you share.</p>
        </section>

        <section id="how-it-works" className="home-explanation homepage-wide-shell" aria-labelledby="how-title">
          <div className="home-section-intro"><p className="home-eyebrow">The everyday, kept together</p><h2 id="how-title" className="home-display home-display-small">A LIFE BETWEEN<br />VET VISITS.</h2><p className="home-copy">A different appetite. A new food. A quieter walk. The small things can be hard to recall months later. Furvise gives them a place to stay.</p></div>
          <div className="home-capabilities">
            <article><p className="home-eyebrow">Keep a record</p><h3>Start with what you notice.</h3><p>Write a note in your own words. Keep observations, routines, and changes in a dated history for each pet.</p></article>
            <article><p className="home-eyebrow">Find the context</p><h3>Ask about their story.</h3><p>Look back at what you’ve shared. Ask Furvise to help make sense of the details, with gaps and uncertainty made clear.</p></article>
            <article><p className="home-eyebrow">Prepare to share</p><h3>Bring the details with you.</h3><p>Put relevant notes into a vet brief you can review and share. Spend less time piecing everything together.</p></article>
          </div>
        </section>

        <section className="home-visual home-context homepage-wide-shell" aria-labelledby="context-title">
          <div className="home-visual-art home-cat" aria-hidden="true"><Image alt="" src="/images/cat.png" width={1024} height={1536} sizes="(min-width: 1024px) 45vw, 90vw" /></div>
          <div className="home-visual-copy"><p className="home-eyebrow">Their own history. Always.</p><h2 id="context-title" className="home-display">EVERY PET.<br />THEIR OWN STORY.</h2><p className="home-lead">Different lives deserve their own context.</p><p className="home-copy">Keep each pet’s notes and care history separate. Return to what changed, what you recorded, and what you want to ask at the next visit.</p><p className="home-care-note">Furvise helps organize information. It does not diagnose or replace veterinary care.</p></div>
        </section>

        <section className="home-progress homepage-wide-shell" aria-labelledby="progress-title">
          <div><p className="home-eyebrow">Public beta</p><h2 id="progress-title" className="home-display home-display-small">GETTING BETTER.<br />WITH YOUR HELP.</h2></div>
          <div><p className="home-copy">We’re improving Furvise as people use it. Read what’s changed, or tell us when something doesn’t work as it should.</p><div className="home-editorial-links"><Link href="/release-notes">Read the release notes <span aria-hidden="true">↗</span></Link><a href="/contact" target="_blank" rel="noopener noreferrer">Report a problem <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></a></div></div>
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
            </nav>
          ) : <nav aria-label="About Furvise" className="homepage-desktop-navigation"><Link className="homepage-header-text-link" href="/#how-it-works">How it works</Link><Link className="homepage-header-text-link" href="/release-notes">Release notes</Link><Link className="homepage-header-text-link" href="/contact">Contact</Link></nav>}
        </div>
        <div className="homepage-header-actions" data-ui="homepage-header-actions">
          {signedIn ? <AccountUtility email={email} /> : null}
          {anonymous ? <><Link className="homepage-header-text-link" href="/login">Sign in</Link><HeaderPrimaryLink href={NEW_PET_LOGIN_PATH}>Get started</HeaderPrimaryLink></> : null}
        </div>
      </div>
      <nav aria-label="Furvise updates" className="homepage-public-navigation" data-signed-in={signedIn}><Link href="/#how-it-works">How it works</Link><Link href="/release-notes">Release notes</Link><Link href="/contact">Contact</Link></nav>
    </header>
  );
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
