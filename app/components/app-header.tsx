"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { NEW_PET_LOGIN_PATH, NEW_PET_ONBOARDING_PATH } from "../lib/auth-routing";
import {
  getActiveMobileNavigationTab,
  MOBILE_NAVIGATION_ITEMS,
  NAVIGATION_ICON_ASSETS,
  shouldShowMobileNavigation,
} from "../lib/navigation/mobile-navigation";
import { useMobileLiquidGlass } from "../lib/navigation/use-mobile-liquid-glass";
import { isAskRequestActive, useAskRequestActive } from "../lib/navigation/ask-request-activity";
import { useAskComposerFocus } from "../lib/navigation/ask-composer-focus";
import { getBrowserSupabase } from "../lib/supabase";
import { PrimaryButton, TextAction } from "./product-primitives";

type HeaderAction = {
  href?: string;
  label: string;
  disabled?: boolean;
  onClick?: () => void;
  variant?: "primary" | "secondary";
};

type HeaderMenuLinkItem = {
  type: "link";
  href: string;
  label: string;
  tone?: "default" | "danger";
};

type HeaderMenuButtonItem = {
  type: "button";
  label: string;
  disabled?: boolean;
  onClick: () => void;
  tone?: "default" | "danger";
};

type HeaderMenuLabelItem = {
  type: "label";
  label: string;
};

type HeaderMenuItem = HeaderMenuLinkItem | HeaderMenuButtonItem | HeaderMenuLabelItem;
type HeaderAuthState = "loading" | "anonymous" | "authenticated";

type AppHeaderProps = {
  actions?: HeaderAction[];
  backFallbackHref?: string;
  backLabel?: string;
  brandHref?: string;
  brandMark?: React.ReactNode;
  compact?: boolean;
  accountMenuItems?: HeaderMenuItem[];
  accountError?: string;
  authState?: HeaderAuthState;
  homepageMenuItems?: HeaderMenuItem[];
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
  { href: "/care-log", label: "History" },
  { href: "/ask", label: "Ask" },
] as const;

const MOBILE_NAV_ITEMS = [
  { ...MOBILE_NAVIGATION_ITEMS[0], icon: "today", label: "Today" },
  { ...MOBILE_NAVIGATION_ITEMS[1], icon: "history", label: "History" },
  { ...MOBILE_NAVIGATION_ITEMS[2], icon: "ask", label: "Ask" },
  { ...MOBILE_NAVIGATION_ITEMS[3], icon: "pets", label: "Pets" },
  { ...MOBILE_NAVIGATION_ITEMS[4], icon: "more", label: "Account" },
] as const;

export function AppHeader({
  accountError = "",
  accountMenuItems = [],
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
  const menuRef = useRef<HTMLDetailsElement>(null);
  const mobileMoreRef = useRef<HTMLDivElement>(null);
  const mobileMoreButtonRef = useRef<HTMLButtonElement>(null);
  const mobileGlassRootRef = useRef<HTMLElement>(null);
  const mobileGlassRef = useRef<HTMLDivElement>(null);
  const mobileNavigationDockRef = useRef<HTMLDivElement>(null);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const menuId = useId();
  const mobileMoreMenuId = useId();
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

  function closeMenu() {
    if (menuRef.current) menuRef.current.open = false;
  }

  function guardAppNavigation(event: ReactMouseEvent<HTMLAnchorElement>) {
    if (!isAskRequestActive()) return;
    event.preventDefault();
  }

  function closeMobileMore(restoreFocus = false) {
    setMobileMoreOpen(false);
    if (restoreFocus) requestAnimationFrame(() => mobileMoreButtonRef.current?.focus());
  }

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (mobileMoreRef.current?.contains(event.target as Node)) return;
      setMobileMoreOpen(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || !mobileMoreOpen) return;
      event.preventDefault();
      closeMobileMore(true);
    }

    document.addEventListener("click", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("click", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [mobileMoreOpen]);

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
            {showMobileNavigation ? (
              <div className="relative lg:hidden" data-ui="mobile-more-container" ref={mobileMoreRef}>
                <button
                  aria-controls={mobileMoreMenuId}
                  aria-expanded={mobileMoreOpen}
                  aria-haspopup="menu"
                  aria-label={mobileMoreOpen ? "Close More menu" : "Open More menu"}
                  className={`touch-manipulation inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-md)] bg-transparent active:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${activeMobileTab === "more" ? "bg-[var(--selected-navigation-background)]" : "hover:bg-[var(--surface-hover)]"}`}
                  data-active-indicator={activeMobileTab === "more" ? "icon-capsule" : undefined}
                  onClick={() => setMobileMoreOpen((open) => !open)}
                  ref={mobileMoreButtonRef}
                  type="button"
                >
                  <span className="inline-flex h-8 w-10 items-center justify-center overflow-hidden rounded-[var(--radius-pill)]">
                    <NavigationIcon asset={NAVIGATION_ICON_ASSETS.more} />
                  </span>
                </button>
                {mobileMoreOpen ? (
                  <div className="absolute right-0 top-[calc(100%+0.5rem)] z-[var(--z-popover)] w-64 max-w-[calc(100vw-2rem)] rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-overlay)] p-1.5 shadow-[var(--shadow-floating)]" data-ui="mobile-more-menu" id={mobileMoreMenuId} role="menu">
                    {accountMenuItems.map((item) => item.type === "link" ? (
                      <Link className="touch-manipulation flex min-h-11 items-center rounded-xl px-3 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] active:bg-[var(--surface-primary)]" href={item.href} key={item.label} onClick={() => closeMobileMore()} role="menuitem">{item.label}</Link>
                    ) : item.type === "label" ? (
                      <div className="truncate border-y border-[var(--border-subtle)] px-3 py-2 text-xs text-[var(--text-muted)]" key={item.label} role="none">{item.label}</div>
                    ) : (
                      <button className={`touch-manipulation flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm font-medium active:bg-[var(--surface-primary)] disabled:cursor-not-allowed disabled:text-[var(--disabled-text)] ${item.tone === "danger" ? "mt-1 border-t border-[var(--border-subtle)] text-[var(--danger-text)]" : "text-[var(--text-primary)]"}`} disabled={item.disabled} key={item.label} onClick={item.onClick} role="menuitem" type="button">{item.label}</button>
                    ))}
                    {accountError ? <p className="px-3 py-2 text-xs leading-5 text-[var(--danger-text)]" role="alert">{accountError}</p> : null}
                  </div>
                ) : null}
              </div>
            ) : null}
            {isHomepage && resolvedAuthState !== "authenticated" ? (
              <div className="hidden items-center gap-2 lg:flex">
                {resolvedHomepageActions.map((action, index) => action.href ? action.variant === "primary" ? (
                  <PrimaryButton className="min-h-11 px-4" href={action.href} key={`${action.label}-${index}`}>{action.label}</PrimaryButton>
                ) : (
                  <TextAction href={action.href} key={`${action.label}-${index}`}>{action.label}</TextAction>
                ) : null)}
              </div>
            ) : (
                <details className="relative hidden lg:block" data-ui="desktop-account-container" ref={menuRef}>
                  <summary aria-controls={menuId} aria-haspopup="menu" aria-label="Open account menu" className={`homepage-header-text-link cursor-pointer list-none ${isActive("/account") ? "app-header-navigation-link" : ""}`} data-active-indicator={isActive("/account") ? "underline" : undefined}>
                    <span>Account</span>
                  </summary>
                  <div className="absolute right-0 top-[3.5rem] z-[var(--z-popover)] w-44 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-overlay)] p-1.5 shadow-[var(--shadow-floating)]" id={menuId} role="menu">
                    {accountMenuItems.map((item) => item.type === "link" ? (
                      <Link className="flex min-h-10 items-center rounded-lg px-3 text-sm text-[var(--text-primary)] hover:bg-[var(--surface-hover)]" href={item.href} key={item.label} onClick={closeMenu} role="menuitem">{item.label}</Link>
                    ) : item.type === "label" ? (
                      <div className="truncate border-b border-[var(--border-subtle)] px-3 py-2 text-xs text-[var(--text-muted)]" key={item.label} role="none">{item.label}</div>
                    ) : (
                      <button className={`flex min-h-10 w-full items-center rounded-lg px-3 text-left text-sm hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:bg-[var(--disabled-surface)] disabled:text-[var(--disabled-text)] ${item.tone === "danger" ? "mt-1 border-t border-[var(--border-subtle)] text-[var(--danger-text)]" : "text-[var(--text-primary)]"}`} disabled={item.disabled} key={item.label} onClick={item.onClick} role="menuitem" type="button">{item.label}</button>
                    ))}
                    {accountError ? <p className="px-3 py-2 text-xs leading-5 text-[var(--danger-text)]" role="alert">{accountError}</p> : null}
                    {!accountMenuItems.length && resolvedAuthState === "anonymous" ? <Link className="flex min-h-10 items-center rounded-lg px-3 text-sm text-[var(--text-primary)] hover:bg-[var(--surface-hover)]" href="/login" role="menuitem">Sign in</Link> : null}
                  </div>
                </details>
            )}
          </div>
        </div>
      </header>

      {askRequestActive ? <p className="border-b border-[var(--line)] bg-[var(--surface-supportive)] px-4 py-1.5 text-center text-xs font-medium text-[var(--text-secondary)]" role="status">Furvise is answering. Navigation will be available when it finishes.</p> : null}

      {showMobileNavigation ? (
        <nav aria-label="Mobile navigation" className="mobile-liquid-glass-root fixed inset-x-0 bottom-0 z-[var(--z-bottom-navigation)] pb-[var(--mobile-nav-safe-area)] lg:hidden" data-liquid-glass-static="" data-state={askCompactNavigation ? "ask-compact" : "stable"} data-ui="mobile-bottom-navigation" ref={mobileGlassRootRef}>
          <span aria-hidden="true" className="mobile-liquid-glass-scene" />
          <div aria-hidden="true" className="mobile-liquid-glass" data-liquid-glass-skip-content="" ref={mobileGlassRef} />
          <div className={`mobile-liquid-glass-content mx-4 mb-2 grid max-w-2xl grid-cols-5 rounded-[var(--radius-xl)] sm:mx-auto ${askCompactNavigation ? "h-[var(--mobile-nav-compact-height)] p-1" : "h-[var(--mobile-nav-expanded-height)] p-1.5"}`} data-liquid-glass-ignore="" data-ui="mobile-navigation-dock" ref={mobileNavigationDockRef}>
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
