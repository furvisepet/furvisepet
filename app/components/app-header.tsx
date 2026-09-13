"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { NEW_PET_LOGIN_PATH, NEW_PET_ONBOARDING_PATH } from "../lib/auth-routing";
import {
  getActiveMobileNavigationTab,
  MOBILE_NAVIGATION_ITEMS,
  shouldShowMobileNavigation,
} from "../lib/navigation/mobile-navigation";
import { useMobileLiquidGlass } from "../lib/navigation/use-mobile-liquid-glass";
import { isAskRequestActive, useAskRequestActive } from "../lib/navigation/ask-request-activity";
import { useAskComposerFocus } from "../lib/navigation/ask-composer-focus";
import { getBrowserSupabase } from "../lib/supabase";
import { PrimaryButton, TextAction } from "./product-primitives";
import { AccountUtility } from "./account-utility";

type HeaderAction = {
  href?: string;
  label: string;
  disabled?: boolean;
  onClick?: () => void;
  variant?: "primary" | "secondary";
};

type HeaderAuthState = "loading" | "anonymous" | "authenticated";

type AppHeaderProps = {
  actions?: HeaderAction[];
  backFallbackHref?: string;
  backLabel?: string;
  brandHref?: string;
  brandMark?: React.ReactNode;
  compact?: boolean;
  accountEmail?: string;
  authState?: HeaderAuthState;
  homepagePolish?: boolean;
  currentPage?: "home" | "dashboard";
  navItems?: { href: string; label: string }[];
  variant?: "homepage" | "site";
  homepageActions?: HeaderAction[];
  sticky?: boolean;
  showBackButton?: boolean;
  title?: React.ReactNode;
};

export const APP_NAV_ITEMS = [
  { href: "/today", label: "Today" },
  { href: "/pets", label: "Pets" },
  { href: "/history", label: "History" },
  { href: "/ask", label: "Ask" },
] as const;

const MOBILE_NAV_ITEMS = [
  { ...MOBILE_NAVIGATION_ITEMS[0], icon: "today", label: "Today" },
  { ...MOBILE_NAVIGATION_ITEMS[1], icon: "history", label: "History" },
  { ...MOBILE_NAVIGATION_ITEMS[2], icon: "ask", label: "Ask" },
  { ...MOBILE_NAVIGATION_ITEMS[3], icon: "pets", label: "Pets" },
] as const;

export function AppHeader({
  accountEmail = "",
  authState,
  brandHref = "/",
  brandMark,
  navItems,
  sticky = false,
  variant = "homepage",
  homepageActions,
}: AppHeaderProps) {
  const pathname = usePathname();
  const askRequestActive = useAskRequestActive();
  const { composerFocused } = useAskComposerFocus();
  const [localAuthState, setLocalAuthState] = useState<HeaderAuthState>(authState ?? "anonymous");
  const mobileGlassRootRef = useRef<HTMLElement>(null);
  const mobileGlassRef = useRef<HTMLDivElement>(null);
  const mobileNavigationDockRef = useRef<HTMLDivElement>(null);
  const isHomepage = variant === "homepage" && pathname === "/";
  const resolvedAuthState = authState ?? localAuthState;
  const activeMobileTab = getActiveMobileNavigationTab(pathname);
  const showMobileNavigation = shouldShowMobileNavigation(pathname, resolvedAuthState === "authenticated");
  const askCompactNavigation = pathname === "/ask" && composerFocused;
  const items = variant === "site" || resolvedAuthState === "authenticated" ? APP_NAV_ITEMS : navItems ?? [];
  const resolvedHomepageActions = homepageActions ?? (
    resolvedAuthState === "authenticated"
      ? [{ href: "/today", label: "Today", variant: "secondary" as const }, { href: NEW_PET_ONBOARDING_PATH, label: "Add pet", variant: "primary" as const }]
      : resolvedAuthState === "anonymous"
        ? [{ href: "/login", label: "Sign in", variant: "secondary" as const }, { href: NEW_PET_LOGIN_PATH, label: "Add your pet", variant: "secondary" as const }]
        : []
  );

  useMobileLiquidGlass(mobileGlassRootRef, mobileGlassRef, showMobileNavigation);

  useEffect(() => {
    if (authState) return;
    const client = getBrowserSupabase();
    if (!client) return;
    let active = true;
    client.auth.getUser().then(({ data }) => {
      if (active) setLocalAuthState(data.user ? "authenticated" : "anonymous");
    }).catch(() => {
      if (active) setLocalAuthState("anonymous");
    });
    return () => { active = false; };
  }, [authState]);

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  function guardAppNavigation(event: ReactMouseEvent<HTMLAnchorElement>) {
    if (!isAskRequestActive()) return;
    event.preventDefault();
  }

  useEffect(() => {
    if (!showMobileNavigation) {
      document.documentElement.style.removeProperty("--mobile-nav-clearance");
      return;
    }

    const dock = mobileNavigationDockRef.current;
    if (!dock) return;

    const updateClearance = () => {
      const contentHeight = Math.ceil(dock.getBoundingClientRect().height);
      if (contentHeight > 0) {
        document.documentElement.style.setProperty(
          "--mobile-nav-clearance",
          `calc(${contentHeight}px + var(--mobile-nav-safe-area) + var(--space-6))`,
        );
      }
    };

    const handleResize = () => requestAnimationFrame(updateClearance);
    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => requestAnimationFrame(updateClearance));

    handleResize();
    if (observer) observer.observe(dock);
    window.addEventListener("resize", handleResize);

    return () => {
      document.documentElement.style.removeProperty("--mobile-nav-clearance");
      observer?.disconnect();
      window.removeEventListener("resize", handleResize);
    };
  }, [askCompactNavigation, showMobileNavigation]);

  return (
    <>
      <header className={`${sticky ? "sticky top-0 z-[var(--z-sticky-controls)]" : ""} homepage-marketing-header`} data-ui="app-header">
        <div className="homepage-wide-shell homepage-header-grid" data-ui="header-optical-row">
          <div className="homepage-header-brand-zone" data-ui="desktop-brand-zone">
            <Link aria-disabled={askRequestActive || undefined} aria-label="Furvise home" className="homepage-brand-link" href={brandHref} onClick={guardAppNavigation}>
              {brandMark ?? <Image alt="" aria-hidden="true" className="homepage-full-logo" height={800} priority sizes="144px" src="/brand/furvise-logo.svg" width={3200} />}
            </Link>
          </div>

          <div className="homepage-header-navigation-zone" data-ui="desktop-navigation-zone">
            {!isHomepage || resolvedAuthState === "authenticated" ? (
              <nav aria-label="Primary navigation" className="homepage-desktop-navigation" data-ui="desktop-navigation-container">
                {items.map((item) => (
                  <Link
                    aria-current={isActive(item.href) ? "page" : undefined}
                    className="homepage-header-text-link app-header-navigation-link"
                    data-active-indicator={isActive(item.href) ? "underline" : undefined}
                    href={item.href}
                    key={item.href}
                    onClick={guardAppNavigation}
                    aria-disabled={askRequestActive || undefined}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            ) : null}
          </div>

          <div className="homepage-header-actions" data-ui="desktop-account-zone">
            {resolvedAuthState === "authenticated" ? (
              <AccountUtility email={accountEmail} />
            ) : isHomepage ? (
              <div className="hidden items-center gap-2 lg:flex">
                {resolvedHomepageActions.map((action, index) => action.href ? action.variant === "primary" ? (
                  <PrimaryButton className="min-h-11 px-4" href={action.href} key={`${action.label}-${index}`}>{action.label}</PrimaryButton>
                ) : (
                  <TextAction href={action.href} key={`${action.label}-${index}`}>{action.label}</TextAction>
                ) : null)}
              </div>
            ) : (
              <Link className="homepage-header-text-link" href="/login">Sign in</Link>
            )}
          </div>
        </div>
      </header>

      {askRequestActive ? <p className="border-b border-[var(--line)] bg-[var(--surface-supportive)] px-4 py-1.5 text-center text-xs font-medium text-[var(--text-secondary)]" role="status">Furvise is answering. Navigation will be available when it finishes.</p> : null}

      {showMobileNavigation ? (
        <nav aria-label="Mobile navigation" className="mobile-liquid-glass-root fixed inset-x-0 bottom-0 z-[var(--z-bottom-navigation)] pb-[var(--mobile-nav-safe-area)] lg:hidden" data-liquid-glass-static="" data-state={askCompactNavigation ? "ask-compact" : "stable"} data-ui="mobile-bottom-navigation" ref={mobileGlassRootRef}>
          <span aria-hidden="true" className="mobile-liquid-glass-scene" />
          <div aria-hidden="true" className="mobile-liquid-glass" data-liquid-glass-skip-content="" ref={mobileGlassRef} />
          <div className={`mobile-liquid-glass-content mx-4 mb-2 grid max-w-2xl grid-cols-4 rounded-[var(--radius-xl)] sm:mx-auto ${askCompactNavigation ? "h-[var(--mobile-nav-compact-height)] p-1" : "h-[var(--mobile-nav-expanded-height)] p-1.5"}`} data-liquid-glass-ignore="" data-ui="mobile-navigation-dock" ref={mobileNavigationDockRef}>
            {MOBILE_NAV_ITEMS.map((item) => {
              const active = activeMobileTab === item.tab;
              return (
                <Link aria-current={active ? "page" : undefined} aria-disabled={askRequestActive || undefined} aria-label={item.label} className={`touch-manipulation flex min-h-11 min-w-0 flex-col items-center justify-center gap-1 rounded-[var(--radius-md)] px-1 text-[0.6875rem] leading-none transition-colors duration-[var(--motion-fast)] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] active:bg-[var(--surface-hover)] ${active ? "font-semibold text-[var(--selected-navigation-foreground)]" : "font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--selected-navigation-foreground)]"}`} data-active-indicator={active ? "icon-capsule" : undefined} href={item.href} key={item.href} onClick={guardAppNavigation}>
                  <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-pill)] transition-all duration-[var(--motion-fast)] motion-reduce:transition-none ${askCompactNavigation ? "h-8 w-10" : "h-10 w-12"} ${active ? "bg-[var(--selected-navigation-background)]" : ""}`}>
                    <NavigationIcon asset={item.asset} />
                  </span>
                  <span className={askCompactNavigation ? "sr-only" : "block whitespace-nowrap"}>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      ) : null}
    </>
  );
}

function NavigationIcon({ asset }: { asset: string }) {
  return (
    <span className="relative h-full w-full">
      <Image
        alt=""
        aria-hidden="true"
        className="object-contain"
        decoding="async"
        draggable={false}
        fill
        loading="lazy"
        sizes="100%"
        src={asset}
      />
    </span>
  );
}
