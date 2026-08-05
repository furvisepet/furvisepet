"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { NEW_PET_LOGIN_PATH, NEW_PET_ONBOARDING_PATH } from "../lib/auth-routing";
import {
  getActiveMobileNavigationTab,
  MOBILE_NAVIGATION_IDLE_EXPAND_MS,
  MOBILE_NAVIGATION_ITEMS,
  NAVIGATION_ICON_ASSETS,
  resolveMobileNavigationState,
  shouldShowMobileNavigation,
  type MobileNavigationState,
} from "../lib/navigation/mobile-navigation";
import { useMobileLiquidGlass } from "../lib/navigation/use-mobile-liquid-glass";
import { getBrowserSupabase } from "../lib/supabase";
import { BrandMark } from "./brand-mark";
import { appPageContainer, PrimaryButton, TextAction } from "./product-primitives";

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
  { href: "/dashboard", label: "Today" },
  { href: "/pets", label: "Pets" },
  { href: "/care-log", label: "History" },
  { href: "/ask", label: "Ask" },
  { href: "/shop", label: "Products" },
] as const;

const MOBILE_NAV_ITEMS = [
  { ...MOBILE_NAVIGATION_ITEMS[0], icon: "today", label: "Today" },
  { ...MOBILE_NAVIGATION_ITEMS[1], icon: "history", label: "History" },
  { ...MOBILE_NAVIGATION_ITEMS[2], icon: "ask", label: "Ask" },
  { ...MOBILE_NAVIGATION_ITEMS[3], icon: "pets", label: "Pets" },
] as const;

let retainedMobileNavigationState: MobileNavigationState = "expanded";

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
  const [localAuthState, setLocalAuthState] = useState<HeaderAuthState>(authState ?? "anonymous");
  const menuRef = useRef<HTMLDetailsElement>(null);
  const mobileMoreRef = useRef<HTMLDetailsElement>(null);
  const mobileMoreSummaryRef = useRef<HTMLElement | null>(null);
  const mobileGlassRootRef = useRef<HTMLElement>(null);
  const mobileGlassRef = useRef<HTMLDivElement>(null);
  const [mobileNavigationState, setMobileNavigationState] = useState<MobileNavigationState>(() => retainedMobileNavigationState);
  const menuId = useId();
  const isHomepage = variant === "homepage" && pathname === "/";
  const resolvedAuthState = authState ?? localAuthState;
  const activeMobileTab = getActiveMobileNavigationTab(pathname);
  const showMobileNavigation = shouldShowMobileNavigation(pathname, resolvedAuthState === "authenticated");
  const items = variant === "site" || resolvedAuthState === "authenticated" ? APP_NAV_ITEMS : navItems ?? [];
  const resolvedHomepageActions = homepageActions ?? (
    resolvedAuthState === "authenticated"
      ? [{ href: "/dashboard", label: "Today", variant: "secondary" as const }, { href: NEW_PET_ONBOARDING_PATH, label: "Add pet", variant: "primary" as const }]
      : resolvedAuthState === "anonymous"
        ? [{ href: "/login", label: "Sign in", variant: "secondary" as const }, { href: NEW_PET_LOGIN_PATH, label: "Add your pet", variant: "secondary" as const }]
        : []
  );

  useMobileLiquidGlass(mobileGlassRootRef, mobileGlassRef, showMobileNavigation, pathname);

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

  function closeMobileMore(restoreFocus = false) {
    if (mobileMoreRef.current) mobileMoreRef.current.open = false;
    if (restoreFocus) requestAnimationFrame(() => mobileMoreSummaryRef.current?.focus());
  }

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!mobileMoreRef.current?.open || mobileMoreRef.current.contains(event.target as Node)) return;
      mobileMoreRef.current.open = false;
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || !mobileMoreRef.current?.open) return;
      event.preventDefault();
      mobileMoreRef.current.open = false;
      requestAnimationFrame(() => mobileMoreSummaryRef.current?.focus());
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    if (!showMobileNavigation) return;

    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let lastScrollY = window.scrollY;
    let accumulatedDelta = 0;
    let direction = 0;
    let animationFrame = 0;
    let idleTimer = 0;

    const updateState = (nextState: MobileNavigationState) => {
      retainedMobileNavigationState = nextState;
      setMobileNavigationState(nextState);
    };

    const expandAfterIdle = () => {
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => updateState("expanded"), MOBILE_NAVIGATION_IDLE_EXPAND_MS);
    };

    const readScrollPosition = () => {
      animationFrame = 0;
      const scrollY = Math.max(0, window.scrollY);
      const delta = scrollY - lastScrollY;
      const nextDirection = Math.sign(delta);
      if (nextDirection && nextDirection !== direction) {
        direction = nextDirection;
        accumulatedDelta = 0;
      }
      if (Math.abs(delta) >= 1) accumulatedDelta += delta;
      lastScrollY = scrollY;

      setMobileNavigationState((currentState) => {
        const nextState = resolveMobileNavigationState({
          accumulatedDelta,
          currentState,
          reducedMotion: reducedMotionQuery.matches,
          scrollY,
        });
        if (nextState !== currentState) {
          retainedMobileNavigationState = nextState;
          accumulatedDelta = 0;
        }
        return nextState;
      });
      expandAfterIdle();
    };

    const handleScroll = () => {
      if (!animationFrame) animationFrame = window.requestAnimationFrame(readScrollPosition);
    };

    const handleReducedMotionChange = () => {
      if (reducedMotionQuery.matches) updateState("expanded");
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    reducedMotionQuery.addEventListener("change", handleReducedMotionChange);
    return () => {
      window.removeEventListener("scroll", handleScroll);
      reducedMotionQuery.removeEventListener("change", handleReducedMotionChange);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(idleTimer);
    };
  }, [showMobileNavigation]);

  return (
    <>
      <header className={`${sticky ? "sticky top-0 z-[var(--z-sticky-controls)]" : ""} border-b border-[var(--border-subtle)] bg-[var(--pw-header-surface)] shadow-[var(--shadow-header)]`} data-ui="app-header">
        <div className={`${appPageContainer} flex min-h-[calc(4.25rem+env(safe-area-inset-top,0px))] items-center justify-between gap-4 pt-[env(safe-area-inset-top,0px)] lg:grid lg:min-h-[4.25rem] lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:gap-4 lg:pt-0`} data-ui="header-optical-row">
          <div className="flex min-w-0 items-center lg:justify-self-start" data-ui="desktop-brand-zone">
            <Link aria-label="Furvise home" className="flex min-h-11 shrink-0 items-center rounded-[var(--radius-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2" href={brandHref}>
              {brandMark ?? <span className="inline-flex items-center [--brand-mark-size:2rem] lg:[--brand-mark-size:3.125rem]"><BrandMark priority size={32} /></span>}
            </Link>
          </div>

          <div className="hidden items-center justify-self-center lg:flex" data-ui="desktop-navigation-zone">
            {!isHomepage || resolvedAuthState === "authenticated" ? (
              <nav aria-label="Primary navigation" className="flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-1" data-ui="desktop-navigation-container">
                {items.map((item) => (
                  <Link
                    aria-current={isActive(item.href) ? "page" : undefined}
                    className={`flex min-h-11 items-center rounded-[var(--radius-sm)] px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${isActive(item.href) ? "bg-[color-mix(in_srgb,var(--soft-sage)_88%,var(--sage)_12%)] font-semibold text-[var(--deep-forest)] shadow-[inset_0_0_0_1px_var(--sage)]" : "bg-transparent font-medium text-[var(--deep-forest)] hover:bg-[var(--surface-hover)]"}`}
                    data-active-indicator={isActive(item.href) ? "background" : undefined}
                    href={item.href}
                    key={item.href}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-2 lg:justify-self-end" data-ui="desktop-account-zone">
            {isHomepage && resolvedAuthState !== "authenticated" ? (
              <div className="hidden items-center gap-2 lg:flex">
                {resolvedHomepageActions.map((action, index) => action.href ? action.variant === "primary" ? (
                  <PrimaryButton className="min-h-11 px-4" href={action.href} key={`${action.label}-${index}`}>{action.label}</PrimaryButton>
                ) : (
                  <TextAction href={action.href} key={`${action.label}-${index}`}>{action.label}</TextAction>
                ) : null)}
              </div>
            ) : (
                <details className="relative hidden rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-1 lg:block" data-ui="desktop-account-container" ref={menuRef}>
                  <summary aria-controls={menuId} aria-haspopup="menu" aria-label="Open account menu" className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-[var(--radius-sm)] bg-transparent px-3 text-sm font-semibold text-[var(--deep-forest)] hover:bg-[var(--surface-hover)] active:bg-[var(--surface-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                    <span>Account</span>
                    <span aria-hidden="true" className="text-xs text-[var(--text-muted)]">⌄</span>
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

      {showMobileNavigation ? (
        <nav aria-label="Mobile navigation" className="mobile-liquid-glass-root fixed inset-x-0 bottom-0 z-[var(--z-bottom-navigation)] pb-[var(--mobile-nav-safe-area)] lg:hidden" data-state={mobileNavigationState} data-ui="mobile-bottom-navigation" ref={mobileGlassRootRef}>
          <span aria-hidden="true" className="mobile-liquid-glass-scene" />
          <div className={`mobile-liquid-glass mx-4 mb-2 grid max-w-2xl grid-cols-5 rounded-[var(--radius-xl)] p-1.5 transition-[height,padding] duration-[var(--motion-standard)] ease-[var(--ease-out)] motion-reduce:transition-none sm:mx-auto ${mobileNavigationState === "compact" ? "h-[var(--mobile-nav-height)]" : "h-[var(--mobile-nav-expanded-height)]"}`} data-ui="mobile-navigation-dock" ref={mobileGlassRef}>
            {MOBILE_NAV_ITEMS.map((item) => {
              const active = activeMobileTab === item.tab;
              const hideLabel = mobileNavigationState === "compact" && !active;
              return (
                <Link aria-current={active ? "page" : undefined} aria-label={item.label} className={`flex min-h-11 min-w-0 flex-col items-center justify-center rounded-[var(--radius-md)] px-1 text-[0.6875rem] leading-none transition-[gap,color] duration-[var(--motion-standard)] ease-[var(--ease-out)] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] ${mobileNavigationState === "compact" ? "gap-0.5" : "gap-1"} ${active ? "font-semibold text-[var(--selected-navigation-foreground)]" : "font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--selected-navigation-foreground)]"}`} data-active-indicator={active ? "icon-capsule" : undefined} href={item.href} key={item.href}>
                  <span className={`${mobileNavigationState === "compact" ? "h-8 w-10" : "h-10 w-12"} inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-pill)] transition-[width,height,background-color] duration-[var(--motion-standard)] ease-[var(--ease-out)] motion-reduce:transition-none ${active ? "bg-[var(--selected-navigation-background)]" : ""}`}>
                    <NavigationIcon asset={item.asset} eager />
                  </span>
                  <span className={hideLabel ? "sr-only" : "block"}>{item.label}</span>
                </Link>
              );
            })}
            <details className="relative" ref={mobileMoreRef}>
              <summary aria-current={activeMobileTab === "more" ? "page" : undefined} aria-label="Open More menu" className={`flex min-h-11 h-full cursor-pointer list-none flex-col items-center justify-center rounded-[var(--radius-md)] px-1 text-[0.6875rem] leading-none transition-[gap,color] duration-[var(--motion-standard)] ease-[var(--ease-out)] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] ${mobileNavigationState === "compact" ? "gap-0.5" : "gap-1"} ${activeMobileTab === "more" ? "font-semibold text-[var(--selected-navigation-foreground)]" : "font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--selected-navigation-foreground)]"}`} ref={(node) => { mobileMoreSummaryRef.current = node; }}>
                <span className={`${mobileNavigationState === "compact" ? "h-8 w-10" : "h-10 w-12"} inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-pill)] transition-[width,height,background-color] duration-[var(--motion-standard)] ease-[var(--ease-out)] motion-reduce:transition-none ${activeMobileTab === "more" ? "bg-[var(--selected-navigation-background)]" : ""}`}>
                  <NavigationIcon asset={NAVIGATION_ICON_ASSETS.more} eager />
                </span>
                <span className={mobileNavigationState === "compact" && activeMobileTab !== "more" ? "sr-only" : "block"}>More</span>
              </summary>
              <div className="absolute right-0 bottom-[calc(100%+0.5rem)] z-[var(--z-popover)] w-64 max-w-[calc(100vw-2rem)] rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-overlay)] p-1.5 shadow-[var(--shadow-floating)]" data-ui="mobile-more-menu" role="menu">
                <Link className="flex min-h-11 items-center rounded-xl px-3 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)]" href="/shop" onClick={() => closeMobileMore()} role="menuitem">Products</Link>
                {accountMenuItems.map((item) => item.type === "link" ? (
                  <Link className="flex min-h-11 items-center rounded-xl px-3 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)]" href={item.href} key={item.label} onClick={() => closeMobileMore()} role="menuitem">{item.label}</Link>
                ) : item.type === "label" ? (
                  <div className="truncate border-y border-[var(--border-subtle)] px-3 py-2 text-xs text-[var(--text-muted)]" key={item.label} role="none">{item.label}</div>
                ) : (
                  <button className={`flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm font-medium disabled:cursor-not-allowed disabled:text-[var(--disabled-text)] ${item.tone === "danger" ? "mt-1 border-t border-[var(--border-subtle)] text-[var(--danger-text)]" : "text-[var(--text-primary)]"}`} disabled={item.disabled} key={item.label} onClick={item.onClick} role="menuitem" type="button">{item.label}</button>
                ))}
                {accountError ? <p className="px-3 py-2 text-xs leading-5 text-[var(--danger-text)]" role="alert">{accountError}</p> : null}
              </div>
            </details>
          </div>
        </nav>
      ) : null}
    </>
  );
}

function NavigationIcon({ asset, eager = false }: { asset: string; eager?: boolean }) {
  const artworkScale = asset === NAVIGATION_ICON_ASSETS.more ? "scale-[2.65]" : "scale-[2.35]";

  return (
    <Image
      alt=""
      aria-hidden="true"
      className={`h-full w-full ${artworkScale} object-contain`}
      decoding={eager ? "sync" : "async"}
      draggable={false}
      height={72}
      loading={eager ? "eager" : "lazy"}
      src={asset}
      width={48}
    />
  );
}
