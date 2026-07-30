"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { NEW_PET_LOGIN_PATH, NEW_PET_ONBOARDING_PATH } from "../lib/auth-routing";
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
  { href: "/dashboard", icon: "today", label: "Today" },
  { href: "/care-log", icon: "history", label: "History" },
  { href: "/ask", icon: "ask", label: "Ask" },
  { href: "/pets", icon: "pets", label: "Pets" },
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
  const [localAuthState, setLocalAuthState] = useState<HeaderAuthState>(authState ?? "anonymous");
  const menuRef = useRef<HTMLDetailsElement>(null);
  const mobileMoreRef = useRef<HTMLDetailsElement>(null);
  const mobileMoreSummaryRef = useRef<HTMLElement | null>(null);
  const menuId = useId();
  const isHomepage = variant === "homepage" && pathname === "/";
  const resolvedAuthState = authState ?? localAuthState;
  const items = variant === "site" || resolvedAuthState === "authenticated" ? APP_NAV_ITEMS : navItems ?? [];
  const resolvedHomepageActions = homepageActions ?? (
    resolvedAuthState === "authenticated"
      ? [{ href: "/dashboard", label: "Today", variant: "secondary" as const }, { href: NEW_PET_ONBOARDING_PATH, label: "Add pet", variant: "primary" as const }]
      : resolvedAuthState === "anonymous"
        ? [{ href: "/login", label: "Sign in", variant: "secondary" as const }, { href: NEW_PET_LOGIN_PATH, label: "Add your pet", variant: "secondary" as const }]
        : []
  );

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

  return (
    <>
      <header className={`${sticky ? "sticky top-0 z-[var(--z-sticky-controls)]" : ""} border-b border-[var(--border-subtle)] bg-[var(--pw-header-surface)] shadow-[var(--shadow-header)]`} data-ui="app-header">
        <div className={`${appPageContainer} flex min-h-[calc(4.25rem+env(safe-area-inset-top,0px))] items-center justify-between gap-4 pt-[env(safe-area-inset-top,0px)] lg:grid lg:min-h-[4.25rem] lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:gap-4 lg:pt-0`} data-ui="header-optical-row">
          <div className="flex min-w-0 items-center lg:justify-self-start" data-ui="desktop-brand-zone">
            <Link aria-label="Furvise home" className="flex min-h-11 shrink-0 items-center rounded-[var(--radius-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2" href={brandHref}>
              {brandMark ?? <span className="inline-flex items-center [--brand-mark-size:2rem] lg:[--brand-mark-size:2.55rem]"><BrandMark priority size={32} /></span>}
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

      {resolvedAuthState === "authenticated" ? (
        <nav aria-label="Mobile navigation" className="fixed inset-x-0 bottom-0 z-[var(--z-bottom-navigation)] pb-[var(--mobile-nav-safe-area)] lg:hidden" data-ui="mobile-bottom-navigation">
          <div className="mx-4 grid h-[var(--mobile-nav-height)] grid-cols-5 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--navigation-background)] p-1 shadow-[var(--shadow-bottom-nav)]" data-ui="mobile-navigation-dock">
            {MOBILE_NAV_ITEMS.map((item) => (
              <Link aria-current={isActive(item.href) ? "page" : undefined} className={`flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-[var(--radius-sm)] px-1 text-[0.6875rem] leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] ${isActive(item.href) ? "bg-[var(--selected-navigation-background)] font-semibold text-[var(--deep-forest)]" : "bg-transparent font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--deep-forest)]"}`} data-active-indicator={isActive(item.href) ? "background" : undefined} href={item.href} key={item.href}><MobileNavigationIcon name={item.icon} /><span>{item.label}</span></Link>
            ))}
            <details className="relative" ref={mobileMoreRef}>
              <summary aria-current={pathname === "/shop" || pathname.startsWith("/shop/") || pathname === "/account" || pathname.startsWith("/account/") ? "page" : undefined} className={`flex min-h-12 cursor-pointer list-none flex-col items-center justify-center gap-1 rounded-[var(--radius-sm)] px-1 text-[0.6875rem] leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] ${pathname === "/shop" || pathname.startsWith("/shop/") || pathname === "/account" || pathname.startsWith("/account/") ? "bg-[var(--selected-navigation-background)] font-semibold text-[var(--deep-forest)]" : "bg-transparent font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--deep-forest)]"}`} ref={(node) => { mobileMoreSummaryRef.current = node; }}><MobileNavigationIcon name="more" /><span>More</span></summary>
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

function MobileNavigationIcon({ name }: { name: "ask" | "history" | "more" | "pets" | "today" }) {
  const commonProps = { "aria-hidden": true, className: "h-5 w-5 shrink-0", fill: "none", stroke: "currentColor", strokeLinecap: "round" as const, strokeLinejoin: "round" as const, strokeWidth: 1.8, viewBox: "0 0 24 24" };
  if (name === "today") return <svg {...commonProps}><path d="M3.5 10.5 12 3.75l8.5 6.75" /><path d="M5.5 9.5v10.25h13V9.5" /><path d="M9.5 19.75v-6h5v6" /></svg>;
  if (name === "history") return <svg {...commonProps}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>;
  if (name === "ask") return <svg {...commonProps}><path d="M4 5.5h16v11H9l-5 3v-14Z" /></svg>;
  if (name === "pets") return <svg {...commonProps} data-icon="pets-paw"><path data-paw-pad="main" d="M8.25 11.25c-2.75.5-4.1 3.15-3.2 5.2.75 1.7 2.65 2.05 4.25 1.2 1.75-.9 3.65-.9 5.4 0 1.6.85 3.5.5 4.25-1.2.9-2.05-.45-4.7-3.2-5.2-2.5-.45-5-.45-7.5 0Z" /><circle cx="7.5" cy="7" data-paw-pad="toe" r="1.75" /><circle cx="12" cy="5.25" data-paw-pad="toe" r="1.75" /><circle cx="16.5" cy="7" data-paw-pad="toe" r="1.75" /></svg>;
  return <svg {...commonProps}><circle cx="6" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="18" cy="12" r="1" fill="currentColor" stroke="none" /></svg>;
}
