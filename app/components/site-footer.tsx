"use client";

import Image from "next/image";
import Link from "next/link";
import type { MouseEvent } from "react";
import { isAskRequestActive, useAskRequestActive } from "../lib/navigation/ask-request-activity";

export function SiteFooter() {
  const answering = useAskRequestActive();
  function guardNavigation(event: MouseEvent<HTMLAnchorElement>) {
    if (isAskRequestActive()) event.preventDefault();
  }
  return (
    <footer className="homepage-marketing-footer site-footer" data-ui="site-footer">
      <div className="homepage-wide-shell homepage-footer-inner">
        <Link aria-label="Furvise home" aria-disabled={answering || undefined} className="homepage-footer-brand" href="/" onClick={guardNavigation}>
          <Image alt="" aria-hidden="true" className="homepage-full-logo homepage-footer-logo" height={800} loading="lazy" sizes="128px" src="/brand/furvise-logo.svg" width={3200} />
        </Link>
        <nav aria-label="Footer navigation" className="homepage-footer-navigation">
          {[{href:"/release-notes",label:"Release notes"},{href:"/contact",label:"Contact us"},{href:"/privacy",label:"Privacy"},{href:"/terms",label:"Terms"}].map(item => (
            <Link className="homepage-footer-link" href={item.href} key={item.href} aria-disabled={answering || undefined} onClick={guardNavigation}>{item.label}</Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
