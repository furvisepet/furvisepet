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
  { ...MOBILE_NAVIGATION_ITEMS[4], icon: "products", label: "Products" },
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
  const [localAuthState, setLocalAuthState] = useState<HeaderAuthState>(authState ?? "anonymous");
  const menuRef = useRef<HTMLDetailsElement>(null);
  const mobileMoreRef = useRef<HTMLDivElement>(null);
  const mobileMoreButtonRef = useRef<HTMLButtonElement>(null);
  const mobileGlassRootRef = useRef<HTMLElement>(null);
  const mobileGlassRef = useRef<HTMLDivElement>(null);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const menuId = useId();
  const mobileMoreMenuId = useId();
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

  return (
    <>
      <header className={`${sticky ? "sticky top-0 z-[var(--z-sticky-controls)]" : ""} border-b border-[var(--border-subtle)] bg-[var(--pw-header-surface)] shadow-[var(--shadow-header)]`} data-ui="app-header">
        <div className={`${appPageContainer} flex min-h-[calc(4.25rem+env(safe-area-inset-top,0px))] items-center justify-between gap-4 pt-[env(safe-area-inset-top,0px)] lg:grid lg:min-h-[4.25rem] lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:gap-4 lg:pt-0`} data-ui="header-optical-row">
          <div className="flex min-w-0 items-center lg:justify-self-start" data-ui="desktop-brand-zone">
            <Link aria-disabled={askRequestActive || undefined} aria-label="Furvise home" className="flex min-h-11 shrink-0 items-center rounded-[var(--radius-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2" href={brandHref} onClick={guardAppNavigation}>
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
                    onClick={guardAppNavigation}
                    aria-disabled={askRequestActive || undefined}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-2 lg:justify-self-end" data-ui="desktop-account-zone">
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
                    <Link aria-disabled={askRequestActive || undefined} className="touch-manipulation flex min-h-11 items-center rounded-xl px-3 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] active:bg-[var(--surface-primary)]" href="/shop" onClick={(event) => { guardAppNavigation(event); if (!event.defaultPrevented) closeMobileMore(); }} role="menuitem">Products</Link>
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

      {askRequestActive ? <p className="border-b border-[var(--line)] bg-[var(--surface-supportive)] px-4 py-1.5 text-center text-xs font-medium text-[var(--text-secondary)]" role="status">Furvise is answering. Navigation will be available when it finishes.</p> : null}

      {showMobileNavigation ? (
        <nav aria-label="Mobile navigation" className="mobile-liquid-glass-root fixed inset-x-0 bottom-0 z-[var(--z-bottom-navigation)] pb-[var(--mobile-nav-safe-area)] lg:hidden" data-liquid-glass-static="" data-state="stable" data-ui="mobile-bottom-navigation" ref={mobileGlassRootRef}>
          <span aria-hidden="true" className="mobile-liquid-glass-scene" />
          <div aria-hidden="true" className="mobile-liquid-glass" data-liquid-glass-skip-content="" ref={mobileGlassRef} />
          <div className="mobile-liquid-glass-content mx-4 mb-2 grid h-[var(--mobile-nav-expanded-height)] max-w-2xl grid-cols-5 rounded-[var(--radius-xl)] p-1.5 sm:mx-auto" data-liquid-glass-ignore="" data-ui="mobile-navigation-dock">
            {MOBILE_NAV_ITEMS.map((item) => {
              const active = activeMobileTab === item.tab;
              return (
                <Link aria-current={active ? "page" : undefined} aria-disabled={askRequestActive || undefined} aria-label={item.label} className={`touch-manipulation flex min-h-11 min-w-0 flex-col items-center justify-center gap-1 rounded-[var(--radius-md)] px-1 text-[0.6875rem] leading-none transition-colors duration-[var(--motion-fast)] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] active:bg-[var(--surface-hover)] ${active ? "font-semibold text-[var(--selected-navigation-foreground)]" : "font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--selected-navigation-foreground)]"}`} data-active-indicator={active ? "icon-capsule" : undefined} href={item.href} key={item.href} onClick={guardAppNavigation}>
                  <span className={`inline-flex h-10 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-pill)] transition-colors duration-[var(--motion-fast)] motion-reduce:transition-none ${active ? "bg-[var(--selected-navigation-background)]" : ""}`}>
                    <NavigationIcon asset={item.asset} />
                  </span>
                  <span className="block whitespace-nowrap">{item.label}</span>
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
    <Image
      alt=""
      aria-hidden="true"
      className="h-full w-full object-contain"
      decoding="async"
      draggable={false}
      height={48}
      loading="lazy"
      src={asset}
      width={48}
    />
  );
}
