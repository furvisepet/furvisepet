import Link from "next/link";
import { PublicPageHeader } from "../components/homepage-client";
import { createPublicPageMetadata } from "../lib/seo";

export const metadata = createPublicPageMetadata({ title: "Release notes", description: "New features, improvements, and fixes in Furvise. Follow our progress through public beta.", path: "/release-notes" });

export default function ReleaseNotesPage() {
  return <div className="homepage-site homepage-refined release-notes-page">
    <PublicPageHeader />
    <main className="release-main">
      <header className="release-heading"><p className="home-eyebrow">Furvise / Updates</p><h1>Release notes</h1><p>What’s new, what’s improved, and what we’re working to make more useful.</p></header>
      <div className="release-layout">
        <aside className="release-index"><p className="home-eyebrow">On this page</p><nav aria-label="Release dates"><a href="#september-15-2026">September 15, 2026</a></nav><Link href="/contact">Share feedback ↗</Link></aside>
        <div>
          <article id="september-15-2026" className="release-entry">
            <div className="release-dateline"><time dateTime="2026-09-15">September 15, 2026</time><span>Public beta</span></div>
            <h2>A clearer record. A closer look.</h2>
            <p>Today’s updates focus on keeping the details you share, making past notes easier to use, and giving you a direct way to tell us when something goes wrong.</p>
            <section><h3>Your notes come first</h3><p>When you ask Furvise to save a care note, saving your words no longer depends on its ability to interpret them. Uncertain AI interpretation won’t block a valid note from being saved.</p></section>
            <section><h3>More useful answers about past notes</h3><p>We improved how Ask handles recorded dates, weight comparisons, and the details of historical care plans. It better distinguishes when something happened from when you entered the note.</p><p>We also improved questions that combine several requests, so an unavailable piece of history doesn’t prevent Furvise from answering the parts it can support.</p></section>
            <section><h3>Clearer dates in vet briefs</h3><p>Vet briefs better preserve the dates you provided in your notes, helping keep the sequence of events clear when you review a summary.</p></section>
            <section><h3>A direct line for feedback</h3><p>The new <Link href="/contact">Contact us page</Link> lets you send a bug report with an optional screenshot. Open it from Ask without leaving your conversation or losing your draft.</p></section>
            <section><h3>A simpler homepage</h3><p>We’ve reduced repeated prompts and made more room for a clear introduction to Furvise. You can now find product updates here in the release notes.</p></section>
            <div className="release-beta-note"><h3>Still improving</h3><p>Furvise is in public beta. Answers can be incomplete or wrong, and you should review notes and summaries before relying on them. Furvise helps organize pet care information and does not replace veterinary care.</p></div>
          </article>
          <footer className="release-footer"><p>Something we should know about?</p><Link href="/contact">Send us feedback ↗</Link><nav aria-label="Page links"><Link href="/">Home</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></nav></footer>
        </div>
      </div>
    </main>
  </div>;
}
