"use client";

import Link from "next/link";
import type { MouseEvent } from "react";
import { isAskRequestActive, useAskRequestActive } from "../lib/navigation/ask-request-activity";

export function PublicLinksMenu() {
  const answering = useAskRequestActive();
  function navigate(event: MouseEvent<HTMLAnchorElement>) {
    if (isAskRequestActive()) event.preventDefault();
    else event.currentTarget.closest("details")?.removeAttribute("open");
  }
  return <details className="homepage-about-menu">
    <summary className="homepage-header-text-link">About</summary>
    <nav aria-label="About Furvise">
      <Link aria-disabled={answering || undefined} onClick={navigate} href="/release-notes">Release notes</Link>
      <Link aria-disabled={answering || undefined} onClick={navigate} href="/contact">Contact us</Link>
      <Link aria-disabled={answering || undefined} onClick={navigate} href="/privacy">Privacy</Link>
      <Link aria-disabled={answering || undefined} onClick={navigate} href="/terms">Terms</Link>
    </nav>
  </details>;
}
