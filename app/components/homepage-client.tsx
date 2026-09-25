"use client";

import Image from "next/image";
import Link from "next/link";
import { useConfirmedSupabaseAuth } from "../lib/auth-session";
import { AppHeader } from "./app-header";
import { SiteFooter } from "./site-footer";

type HomepageMode = "loading" | "anonymous" | "no-pets" | "with-pet";
export function HomepageClient() {
  const auth = useConfirmedSupabaseAuth();
  const mode: HomepageMode = auth.status === "loading" ? "loading" : auth.status === "signedIn" ? "with-pet" : "anonymous";
  const signedIn = mode === "with-pet";
  return (
    <div className="homepage-site homepage-refined min-h-screen overflow-x-hidden" data-authenticated={signedIn ? "true" : "false"} data-ui="marketing-homepage">
      <PublicMarketingHeader email={auth.user?.email} mode={mode} />
      <main className="homepage-dark-world" data-marketing-surface="dark" data-ui="homepage-story-main">
        <section className="home-visual home-hero homepage-wide-shell" aria-labelledby="home-title">
          <div className="home-visual-copy">
            <p className="app-page-eyebrow home-eyebrow">Furvise for pet owners</p>
            <h1 id="home-title" aria-label="Your pet’s care, in one place." className="app-page-title home-display">Your pet’s care,<br />in one place.</h1>
            <p className="app-page-subtitle home-lead">Log your pet’s care, find past notes, and ask questions about what you’ve logged.</p>
          </div>
          <div className="home-visual-art home-heron" aria-hidden="true"><Image alt="" src="/images/heron.png" width={1224} height={1285} priority sizes="(min-width: 1024px) 45vw, 90vw" /></div>
        </section>

        <section id="how-it-works" className="home-visual home-explanation homepage-wide-shell" aria-labelledby="how-title">
          <div className="home-visual-copy">
            <h2 id="how-title" className="app-section-title home-section-title">From a quick note<br />to your next vet visit.</h2>
            <div className="home-capabilities">
              <article><h3>Write down what happened</h3><p>A change in appetite, a new food, or how a walk went. Add a dated note in your own words. Each pet has a separate care history.</p></article>
              <article><h3>Ask about earlier notes</h3><p>“When did we change her food?” or “What were his earliest and latest recorded weights?” Ask Furvise to help you find and compare what you’ve recorded.</p></article>
              <article><h3>Prepare a vet brief</h3><p>Bring relevant notes together in a summary. Check the details, then share it with your vet.</p></article>
            </div>
            <p id="context-title" className="home-care-note">Furvise helps organize information. It does not diagnose or replace veterinary care.</p>
          </div>
          <div className="home-visual-art home-cat" aria-hidden="true"><Image alt="" src="/images/cat.png" width={1024} height={1536} sizes="(min-width: 1024px) 40vw, 80vw" /></div>
        </section>

        <section className="home-progress homepage-wide-shell" aria-labelledby="progress-title">
          <div><p className="app-page-eyebrow">Public beta</p><h2 id="progress-title" className="app-section-title">Help us improve Furvise.</h2></div>
          <div><p>Ask can make mistakes or fail to answer. Tell us when something goes wrong, or read about the latest changes.</p><div className="home-editorial-links"><Link href="/release-notes">Read the release notes <span aria-hidden="true">↗</span></Link><a href="/contact" target="_blank" rel="noopener noreferrer">Report a problem <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></a></div></div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function PublicMarketingHeader({ email, mode }: { email?: string | null; mode: HomepageMode }) {
  return <AppHeader accountEmail={email ?? ""} authState={mode === "loading" ? "loading" : mode === "with-pet" ? "authenticated" : "anonymous"} brandHref="/" variant="site" sticky />;
}

export function PublicPageHeader() {
  const auth = useConfirmedSupabaseAuth();
  const mode: HomepageMode = auth.status === "loading" ? "loading" : auth.status === "signedIn" ? "with-pet" : "anonymous";
  return <PublicMarketingHeader email={auth.user?.email} mode={mode} />;
}
