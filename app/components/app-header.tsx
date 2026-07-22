"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";
import { useAppearance } from "./appearance-provider";
import { BackButton } from "./back-button";

type HeaderAction = {
  href?: string;
  label: string;
  disabled?: boolean;
  onClick?: () => void;
  variant?: "primary" | "secondary";
};

type HeaderNavItem = {
  href: string;
  label: string;
  active?: boolean;
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

type HeaderMenuItem = HeaderMenuLinkItem | HeaderMenuButtonItem;

type HeaderAuthState = "loading" | "anonymous" | "authenticated";
type HeaderVariant = "homepage" | "site";
type CurrentPage = "home" | "dashboard";

type AppHeaderProps = {
  actions?: HeaderAction[];
  backFallbackHref?: string;
  backLabel?: string;
  brandHref?: string;
  brandMark?: ReactNode;
  compact?: boolean;
  accountMenuItems?: HeaderMenuItem[];
  authState?: HeaderAuthState;
  homepageMenuItems?: HeaderMenuItem[];
  homepagePolish?: boolean;
  currentPage?: CurrentPage;
  navItems?: HeaderNavItem[];
  variant?: HeaderVariant;
  sticky?: boolean;
  showBackButton?: boolean;
  title?: ReactNode;
};

export function AppHeader({
  actions = [],
  backFallbackHref = "/",
  backLabel = "Back",
  brandHref = "/",
  brandMark,
  compact = false,
  accountMenuItems = [],
  authState: _authState = "anonymous",
  homepageMenuItems = [],
  homepagePolish = false,
  currentPage,
  navItems = [],
  variant = "homepage",
  sticky = false,
  showBackButton = false,
  title,
}: AppHeaderProps) {
  const { openAppearance } = useAppearance();
  const pathname = usePathname();
  const [desktopMenuOpen, setDesktopMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileAccountMenuOpen, setMobileAccountMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const hasMounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const desktopMenuId = useId();
  const mobileMenuId = useId();
  const mobileAccountMenuId = useId();
  const isHomepageVariant = variant === "homepage";
  const isSiteVariant = variant === "site";
  const authResolved = hasMounted && _authState !== "loading";
  const safeAccountMenuItems = authResolved ? accountMenuItems : [];
  const safeHomepageAccountMenuItems = authResolved
    ? homepageMenuItems.length > 0
      ? homepageMenuItems
      : accountMenuItems
    : [];
  const hasAccountMenuItems =
    isSiteVariant ||
    (isHomepageVariant && navItems.length > 0) ||
    accountMenuItems.length > 0 ||
    homepageMenuItems.length > 0 ||
    safeAccountMenuItems.length > 0 ||
    safeHomepageAccountMenuItems.length > 0;
  const homepageAccountMenuItems = safeHomepageAccountMenuItems;
  const resolvedBrandMark = brandMark === undefined ? <DefaultBrandMark /> : brandMark;

  useEffect(() => {
    if (!sticky) {
      return;
    }

    const updateScrollState = () => {
      setIsScrolled(window.scrollY > 8);
    };

    updateScrollState();
    window.addEventListener("scroll", updateScrollState, { passive: true });

    return () => {
      window.removeEventListener("scroll", updateScrollState);
    };
  }, [sticky]);

  function closeDesktopMenu() {
    setDesktopMenuOpen(false);
  }

  function closeMobileMenu() {
    setMobileMenuOpen(false);
    setMobileAccountMenuOpen(false);
  }

  function closeAllMenus() {
    closeDesktopMenu();
    closeMobileMenu();
  }

  function handleBrandClick(event: MouseEvent<HTMLAnchorElement>) {
    if (pathname === "/" && brandHref === "/") {
      event.preventDefault();
      window.scrollTo({ behavior: "smooth", top: 0 });
      closeAllMenus();
    }
  }

  function handleSectionClick(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (!href.startsWith("#")) {
      closeAllMenus();
      return;
    }

    event.preventDefault();
    const id = href.slice(1);
    const target = document.getElementById(id);

    if (target) {
      target.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }

    closeAllMenus();
  }

  function handleAppearanceClick() {
    closeAllMenus();
    openAppearance();
  }

  function isNavItemActive(item: HeaderNavItem) {
    if (pathname === item.href) {
      return true;
    }

    if (typeof item.active === "boolean") {
      return item.active;
    }

    if (currentPage === "dashboard") {
      return item.href === "/dashboard";
    }

    if (currentPage === "home") {
      return item.href === "/";
    }

    if (item.href === "/") {
      return pathname === "/";
    }

    if (item.href === "/dashboard") {
      return pathname === "/dashboard";
    }

    if (item.href === "/pets") {
      return pathname === "/pets" || pathname.startsWith("/pets/") || pathname.startsWith("/dogs/");
    }

    if (item.href === "/care-log") {
      return pathname === "/care-log";
    }

    if (item.href === "/shop") {
      return pathname === "/shop";
    }

    if (item.href === "/ask") {
      return pathname === "/ask";
    }

    return false;
  }

  const shellClasses = sticky
    ? `sticky top-0 z-50 w-full max-w-full min-w-0 overflow-x-clip px-2 pt-2 sm:px-4 sm:pt-4 ${compact ? "pb-0" : "pb-0"}`
    : `flex w-full max-w-full min-w-0 flex-wrap items-center justify-between gap-3 overflow-x-clip ${compact ? "" : "pb-1"}`;

  const cardClasses = sticky
    ? `box-border w-full max-w-full min-w-0 rounded-[1.75rem] border px-3 py-3 shadow-sm transition-all duration-200 sm:px-5 sm:py-4 ${
        isScrolled
          ? "border-[var(--pw-border)] bg-[var(--pw-header-surface)] backdrop-blur-xl shadow-[0_18px_40px_var(--pw-shadow)]"
          : "border-[color-mix(in_srgb,var(--pw-border)_72%,transparent)] bg-[var(--pw-header-surface)] backdrop-blur-xl shadow-[0_12px_28px_var(--pw-shadow)]"
      }`
    : "";

  function renderAction(action: HeaderAction, mobile = false, compactTop = false) {
    const actionClasses =
      homepagePolish && action.variant === "secondary"
        ? `inline-flex items-center justify-center text-sm font-medium text-[var(--pw-muted)] transition hover:text-[var(--pw-heading)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--pw-primary)_35%,transparent)] ${
            compactTop
              ? "min-h-10 max-w-[5.5rem] shrink rounded-full border border-[var(--pw-border-strong)] bg-[var(--pw-surface-strong)] px-3 sm:min-h-11 sm:max-w-none sm:px-4"
              : `min-h-11 px-1 ${mobile ? "w-full justify-start py-2.5" : ""}`
          }`
        : `inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-medium transition disabled:cursor-wait disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--pw-primary)_35%,transparent)] ${
            homepagePolish && action.variant === "primary"
              ? "bg-[var(--pw-primary)] px-5 text-white shadow-sm hover:bg-[var(--pw-primary-hover)]"
              : action.variant === "primary"
                ? "border border-transparent bg-[var(--pw-primary)] px-4 py-2 text-white shadow-sm hover:bg-[var(--pw-primary-hover)]"
                : "border border-[var(--pw-border-strong)] bg-[var(--pw-surface-strong)] text-[var(--pw-text)] shadow-sm hover:border-[var(--pw-secondary)] hover:text-[var(--pw-primary)]"
          } ${homepagePolish && action.variant === "primary" ? "text-[0.98rem] font-semibold" : ""} ${
            mobile && action.variant === "primary" ? "w-full" : ""
          } ${compactTop ? "min-h-10 max-w-[5.75rem] shrink px-3 sm:min-h-11 sm:max-w-none sm:px-4" : ""}`;

    if (action.href) {
      return (
        <Link
          className={actionClasses}
          href={action.href}
          key={action.label}
          onClick={(event) => {
            if (mobile) {
              closeAllMenus();
            } else {
              closeDesktopMenu();
            }
            action.onClick?.();
            if (action.href?.startsWith("#")) {
              event.preventDefault();
            }
          }}
        >
          <span className={compactTop ? "truncate" : ""}>{action.label}</span>
        </Link>
      );
    }

    return (
      <button
        className={actionClasses}
        disabled={action.disabled}
        key={action.label}
        onClick={() => {
          if (mobile) {
            closeAllMenus();
          } else {
            closeDesktopMenu();
          }
          action.onClick?.();
        }}
        type="button"
      >
        <span className={compactTop ? "truncate" : ""}>{action.label}</span>
      </button>
    );
  }

  function renderMenuItem(item: HeaderMenuItem, mobile = false) {
    const baseClasses =
      item.tone === "danger"
        ? "text-[color-mix(in_srgb,var(--pw-text)_80%,#b42318)] hover:bg-[color-mix(in_srgb,var(--pw-primary-soft)_45%,transparent)]"
        : "text-[var(--pw-text)] hover:bg-[var(--pw-card-muted)]";

    const className = `inline-flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--pw-primary)_35%,transparent)] ${baseClasses} ${
      mobile ? "" : "min-h-11"
    }`;

    if (item.type === "link") {
      return (
        <Link
          className={className}
          href={item.href}
          key={item.label}
          onClick={(event) => {
            const href = item.href;
            if (href.startsWith("#")) {
              event.preventDefault();
              handleSectionClick(event, href);
              return;
            }
            closeAllMenus();
          }}
          role="menuitem"
          tabIndex={0}
        >
          {item.label}
        </Link>
      );
    }

    return (
      <button
        aria-disabled={item.disabled || undefined}
        className={className}
        disabled={item.disabled}
        key={item.label}
        onClick={() => {
          closeAllMenus();
          item.onClick();
        }}
        role="menuitem"
        tabIndex={0}
        type="button"
      >
        {item.label}
      </button>
    );
  }

  function renderNavItem(item: HeaderNavItem, mobile = false) {
    const active = isNavItemActive(item);
    const activeClasses = active
      ? "text-[var(--pw-heading)]"
      : "text-[var(--pw-muted)] hover:text-[var(--pw-heading)]";

    return (
      <Link
        aria-current={active ? "page" : undefined}
        className={`inline-flex items-center text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--pw-primary)_35%,transparent)] ${
          homepagePolish ? "lg:text-[0.98rem]" : ""
        } ${activeClasses} ${mobile ? "w-full py-2.5 text-left" : "whitespace-nowrap py-1"}`}
        href={item.href}
        key={item.label}
        onClick={(event) => {
          if (mobile) {
            closeAllMenus();
          }
          handleSectionClick(event, item.href);
        }}
      >
        {item.label}
      </Link>
    );
  }

  function renderAppearanceMenuItem() {
    return (
      <button
        className="inline-flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left text-sm font-medium text-[var(--pw-text)] transition hover:bg-[var(--pw-card-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--pw-primary)_35%,transparent)]"
        onClick={handleAppearanceClick}
        role="menuitem"
        tabIndex={0}
        type="button"
      >
        Appearance
      </button>
    );
  }

  function renderAccountMenuContents(menuItems: HeaderMenuItem[], mobile = false) {
    const [firstItem, ...remainingItems] = menuItems;

    return (
      <>
        {firstItem ? renderMenuItem(firstItem, mobile) : null}
        {renderAppearanceMenuItem()}
        {remainingItems.map((item) => renderMenuItem(item, mobile))}
      </>
    );
  }

  function renderAccountMenuPanel(
    menuId: string,
    isDesktop = true,
    menuItems = safeAccountMenuItems,
  ) {
    return (
      <div
        aria-label="Account menu"
        className={`absolute right-0 top-[calc(100%+0.75rem)] z-30 w-64 rounded-[1.4rem] border border-[var(--pw-border)] bg-[var(--pw-surface-elevated)] p-2 shadow-xl shadow-[var(--pw-shadow)] backdrop-blur-xl ${
          isDesktop ? "" : "left-0 right-0 top-[calc(100%+0.5rem)] w-auto"
        }`}
        id={menuId}
        role="menu"
      >
        <div className="grid gap-1">
          {renderAccountMenuContents(menuItems)}
        </div>
      </div>
    );
  }

  function renderSiteShell() {
    return (
      <header className={shellClasses}>
        <div className={cardClasses}>
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
              {showBackButton ? <BackButton fallbackHref={backFallbackHref} label={backLabel} /> : null}
              {resolvedBrandMark ? <div className="shrink-0">{resolvedBrandMark}</div> : null}
              <Link
                className="min-w-0 shrink truncate text-xl font-semibold tracking-tight text-[var(--pw-heading)] sm:text-2xl"
                href={brandHref}
                onClick={handleBrandClick}
              >
                Furvise
              </Link>
              {title ? <div className="hidden text-sm text-[var(--pw-muted)] sm:block">{title}</div> : null}
            </div>

            <div className="hidden min-w-0 flex-1 justify-center xl:flex">
              {navItems.length > 0 ? (
                <nav aria-label="Site sections" className="flex min-w-0 items-center gap-5 2xl:gap-6">
                  {navItems.map((item) => renderNavItem(item))}
                </nav>
              ) : null}
            </div>

            <div className="hidden shrink-0 items-center gap-2.5 xl:flex">
              {actions.map((action) => renderAction(action))}
              <div className="relative">
                <button
                  aria-controls={desktopMenuId}
                  aria-expanded={desktopMenuOpen}
                  aria-haspopup="menu"
                  aria-label={desktopMenuOpen ? "Close account menu" : "Open account menu"}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-transparent bg-[var(--pw-surface-strong)] text-[var(--pw-text)] shadow-sm transition hover:bg-[var(--pw-card-muted)] hover:text-[var(--pw-heading)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--pw-primary)_35%,transparent)] sm:h-11 sm:w-11"
                  onClick={() => {
                    if (!hasAccountMenuItems) {
                      return;
                    }
                    setMobileMenuOpen(false);
                    setDesktopMenuOpen((value) => !value);
                  }}
                  type="button"
                >
                  <span className="sr-only">
                    {desktopMenuOpen ? "Close account menu" : "Open account menu"}
                  </span>
                  <AccountMenuIcon />
                </button>

                {desktopMenuOpen && hasAccountMenuItems ? renderAccountMenuPanel(desktopMenuId) : null}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2 xl:hidden">
              {actions.map((action) => renderAction(action, false, true))}
              {navItems.length > 0 ? (
                <button
                  aria-controls={mobileMenuId}
                  aria-expanded={mobileMenuOpen}
                  aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-transparent bg-[var(--pw-surface-strong)] text-[var(--pw-text)] shadow-sm transition hover:bg-[var(--pw-card-muted)] hover:text-[var(--pw-heading)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--pw-primary)_35%,transparent)] sm:h-11 sm:w-11"
                  onClick={() => {
                    setDesktopMenuOpen(false);
                    setMobileAccountMenuOpen(false);
                    setMobileMenuOpen((value) => !value);
                  }}
                  type="button"
                >
                  <span className="sr-only">{mobileMenuOpen ? "Close menu" : "Open menu"}</span>
                  <MenuIcon />
                </button>
              ) : null}
              <button
                aria-controls={mobileAccountMenuId}
                aria-expanded={mobileAccountMenuOpen}
                aria-haspopup="menu"
                aria-label={mobileAccountMenuOpen ? "Close account menu" : "Open account menu"}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-transparent bg-[var(--pw-surface-strong)] text-[var(--pw-text)] shadow-sm transition hover:bg-[var(--pw-card-muted)] hover:text-[var(--pw-heading)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--pw-primary)_35%,transparent)] sm:h-11 sm:w-11"
                onClick={() => {
                  if (!hasAccountMenuItems) {
                    return;
                  }
                  setDesktopMenuOpen(false);
                  setMobileMenuOpen(false);
                  setMobileAccountMenuOpen((value) => !value);
                }}
                type="button"
              >
                <span className="sr-only">{mobileAccountMenuOpen ? "Close menu" : "Open menu"}</span>
                <AccountMenuIcon />
              </button>
            </div>
          </div>

          {navItems.length > 0 ? (
            <div
              className={`xl:hidden ${
                mobileMenuOpen
                  ? "pointer-events-auto mt-4 opacity-100"
                  : "pointer-events-none max-h-0 overflow-hidden opacity-0"
              } transition duration-200`}
              id={mobileMenuId}
            >
              <div className="rounded-[1.5rem] border border-[var(--pw-border)] bg-[var(--pw-surface-elevated)] p-3 shadow-lg shadow-[var(--pw-shadow)] backdrop-blur-xl">
                <nav aria-label="Primary navigation" className="grid gap-1">
                  {navItems.map((item) => renderNavItem(item, true))}
                </nav>
              </div>
            </div>
          ) : null}

          <div
            className={`xl:hidden ${
              mobileAccountMenuOpen
                ? "pointer-events-auto mt-4 opacity-100"
                : "pointer-events-none max-h-0 overflow-hidden opacity-0"
            } transition duration-200`}
            id={mobileAccountMenuId}
          >
            <div
              className="rounded-[1.5rem] border border-[var(--pw-border)] bg-[var(--pw-surface-elevated)] p-3 shadow-lg shadow-[var(--pw-shadow)] backdrop-blur-xl"
              role="menu"
              aria-label="Account menu"
            >
              <div className="grid gap-1">
                {hasAccountMenuItems ? renderAccountMenuContents(safeAccountMenuItems, true) : null}
              </div>
            </div>
          </div>
        </div>
      </header>
    );
  }

  function renderCalmDashboardShell() {
    const dashboardCardClasses =
      "w-full max-w-full min-w-0 rounded-[1.75rem] border border-[var(--pw-border)] bg-[var(--pw-header-surface)] px-4 py-3.5 shadow-sm backdrop-blur-xl sm:px-5 sm:py-4";

    return (
      <header className={shellClasses}>
        <div className={dashboardCardClasses}>
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
              {showBackButton ? <BackButton fallbackHref={backFallbackHref} label={backLabel} /> : null}
              {resolvedBrandMark ? <div className="shrink-0">{resolvedBrandMark}</div> : null}
              <Link
                className="min-w-0 shrink truncate text-xl font-semibold tracking-tight text-[var(--pw-heading)] sm:text-2xl"
                href={brandHref}
                onClick={handleBrandClick}
              >
                Furvise
              </Link>
              {title ? <div className="hidden text-sm text-[var(--pw-muted)] sm:block">{title}</div> : null}
            </div>

            <div className="hidden items-center gap-2.5 lg:flex">
              {actions.map((action) => renderAction(action))}
              {hasAccountMenuItems ? (
                <div className="relative">
                  <button
                    aria-controls={desktopMenuId}
                    aria-expanded={desktopMenuOpen}
                    aria-haspopup="menu"
                    aria-label={desktopMenuOpen ? "Close account menu" : "Open account menu"}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-transparent bg-[var(--pw-surface-strong)] text-[var(--pw-text)] shadow-sm transition hover:bg-[var(--pw-card-muted)] hover:text-[var(--pw-heading)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--pw-primary)_35%,transparent)] sm:h-11 sm:w-11"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setDesktopMenuOpen((value) => !value);
                    }}
                    type="button"
                  >
                    <span className="sr-only">
                      {desktopMenuOpen ? "Close account menu" : "Open account menu"}
                    </span>
                    <AccountMenuIcon />
                  </button>

                  {desktopMenuOpen ? renderAccountMenuPanel(desktopMenuId) : null}
                </div>
              ) : null}
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2 lg:hidden">
              {actions.map((action) => renderAction(action, false, true))}
              {hasAccountMenuItems ? (
                <button
                  aria-controls={mobileMenuId}
                  aria-expanded={mobileMenuOpen}
                  aria-label={mobileMenuOpen ? "Close account menu" : "Open account menu"}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-transparent bg-[var(--pw-surface-strong)] text-[var(--pw-text)] shadow-sm transition hover:bg-[var(--pw-card-muted)] hover:text-[var(--pw-heading)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--pw-primary)_35%,transparent)] sm:h-11 sm:w-11"
                  onClick={() => {
                    setDesktopMenuOpen(false);
                    setMobileMenuOpen((value) => !value);
                  }}
                  type="button"
                >
                  <span className="sr-only">{mobileMenuOpen ? "Close menu" : "Open menu"}</span>
                  <AccountMenuIcon />
                </button>
              ) : null}
            </div>
          </div>

          {hasAccountMenuItems ? (
            <div
              className={`lg:hidden ${
                mobileMenuOpen
                  ? "pointer-events-auto mt-4 opacity-100"
                  : "pointer-events-none max-h-0 overflow-hidden opacity-0"
              } transition duration-200`}
              id={mobileMenuId}
            >
              <div
                className="rounded-[1.5rem] border border-[var(--pw-border)] bg-[var(--pw-surface-elevated)] p-3 shadow-lg shadow-[var(--pw-shadow)] backdrop-blur-xl"
                role="menu"
                aria-label="Account menu"
              >
                <div className="grid gap-1">
                  {renderAccountMenuContents(safeAccountMenuItems, true)}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </header>
    );
  }

  function renderHomepageShell() {
    const secondaryAction = actions[0];
    const primaryAction = actions[1];

    return (
      <header className={shellClasses}>
        <div className={cardClasses}>
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
              {showBackButton ? <BackButton fallbackHref={backFallbackHref} label={backLabel} /> : null}
              {resolvedBrandMark ? <div className="shrink-0">{resolvedBrandMark}</div> : null}
              <Link
                className="min-w-0 shrink truncate text-xl font-semibold tracking-tight text-[var(--pw-heading)] sm:text-2xl"
                href={brandHref}
                onClick={handleBrandClick}
              >
                Furvise
              </Link>
              {title ? <div className="hidden text-sm text-[var(--pw-muted)] sm:block">{title}</div> : null}
            </div>

            <div className="hidden flex-1 justify-center lg:flex">
              {navItems.length > 0 ? (
                <nav aria-label="Homepage sections" className="flex items-center gap-8">
                  {navItems.map((item) => renderNavItem(item))}
                </nav>
              ) : null}
            </div>

            <div className="hidden items-center gap-2.5 lg:flex">
              {secondaryAction ? renderAction(secondaryAction) : null}
              {primaryAction ? renderAction(primaryAction) : null}
              <div className="relative">
                <button
                  aria-controls={desktopMenuId}
                  aria-expanded={desktopMenuOpen}
                  aria-haspopup="menu"
                  aria-label={desktopMenuOpen ? "Close account menu" : "Open account menu"}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-transparent bg-[var(--pw-surface-strong)] text-[var(--pw-text)] shadow-sm transition hover:bg-[var(--pw-card-muted)] hover:text-[var(--pw-heading)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--pw-primary)_35%,transparent)] sm:h-11 sm:w-11"
                  onClick={() => {
                    if (!hasAccountMenuItems) {
                      return;
                    }
                    setMobileMenuOpen(false);
                    setDesktopMenuOpen((value) => !value);
                  }}
                  type="button"
                >
                  <span className="sr-only">{desktopMenuOpen ? "Close account menu" : "Open account menu"}</span>
                  <AccountMenuIcon />
                </button>

                {desktopMenuOpen && hasAccountMenuItems ? renderAccountMenuPanel(desktopMenuId, true, homepageAccountMenuItems) : null}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2 lg:hidden">
              <button
                aria-controls={mobileMenuId}
                aria-expanded={mobileMenuOpen}
                aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-transparent bg-[var(--pw-surface-strong)] text-[var(--pw-text)] shadow-sm transition hover:bg-[var(--pw-card-muted)] hover:text-[var(--pw-heading)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--pw-primary)_35%,transparent)] sm:h-11 sm:w-11"
                onClick={() => {
                  setDesktopMenuOpen(false);
                  setMobileAccountMenuOpen(false);
                  setMobileMenuOpen((value) => !value);
                }}
                type="button"
              >
                <span className="sr-only">{mobileMenuOpen ? "Close menu" : "Open menu"}</span>
                <MenuIcon />
              </button>
              <button
                aria-controls={mobileAccountMenuId}
                aria-expanded={mobileAccountMenuOpen}
                aria-haspopup="menu"
                aria-label={mobileAccountMenuOpen ? "Close account menu" : "Open account menu"}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-transparent bg-[var(--pw-surface-strong)] text-[var(--pw-text)] shadow-sm transition hover:bg-[var(--pw-card-muted)] hover:text-[var(--pw-heading)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--pw-primary)_35%,transparent)] sm:h-11 sm:w-11"
                onClick={() => {
                  if (!hasAccountMenuItems) {
                    return;
                  }
                  setDesktopMenuOpen(false);
                  setMobileMenuOpen(false);
                  setMobileAccountMenuOpen((value) => !value);
                }}
                type="button"
              >
                <span className="sr-only">{mobileAccountMenuOpen ? "Close menu" : "Open menu"}</span>
                <AccountMenuIcon />
              </button>
            </div>
          </div>

          <div
            className={`lg:hidden ${
              mobileMenuOpen
                ? "pointer-events-auto mt-4 opacity-100"
                : "pointer-events-none max-h-0 overflow-hidden opacity-0"
            } transition duration-200`}
            id={mobileMenuId}
          >
            <div
              className="rounded-[1.5rem] border border-[var(--pw-border)] bg-[var(--pw-surface-elevated)] p-3 shadow-lg shadow-[var(--pw-shadow)] backdrop-blur-xl"
              role="menu"
              aria-label="Navigation menu"
            >
              <div className="grid gap-1">
                {navItems.map((item) => renderNavItem(item, true))}
              </div>

            </div>
          </div>
          <div
            className={`lg:hidden ${
              mobileAccountMenuOpen
                ? "pointer-events-auto mt-4 opacity-100"
                : "pointer-events-none max-h-0 overflow-hidden opacity-0"
            } transition duration-200`}
            id={mobileAccountMenuId}
          >
            <div
              className="rounded-[1.5rem] border border-[var(--pw-border)] bg-[var(--pw-surface-elevated)] p-3 shadow-lg shadow-[var(--pw-shadow)] backdrop-blur-xl"
              role="menu"
              aria-label="Account menu"
            >
              <div className="grid gap-1">
                {hasAccountMenuItems ? renderAccountMenuContents(homepageAccountMenuItems, true) : null}
              </div>
            </div>
          </div>
        </div>
      </header>
    );
  }

  if (isHomepageVariant && navItems.length > 0) {
    return renderHomepageShell();
  }

  if (isSiteVariant) {
    return renderSiteShell();
  }

  if (hasAccountMenuItems) {
    return renderCalmDashboardShell();
  }

  if (!sticky && navItems.length === 0) {
    return (
      <header className={shellClasses}>
        <div className="flex max-w-full min-w-0 flex-1 basis-[13rem] items-center gap-2 sm:gap-4">
          {showBackButton ? <BackButton fallbackHref={backFallbackHref} label={backLabel} /> : null}
          {resolvedBrandMark ? <div className="shrink-0">{resolvedBrandMark}</div> : null}
          <Link
            className="min-w-0 shrink truncate text-xl font-semibold tracking-tight text-[var(--pw-heading)] sm:text-2xl"
            href={brandHref}
            onClick={handleBrandClick}
          >
            Furvise
          </Link>
          {title ? <div className="hidden text-sm text-[var(--pw-muted)] sm:block">{title}</div> : null}
        </div>

        <div className="flex max-w-full shrink-0 basis-full flex-wrap items-center justify-start gap-2 sm:basis-auto sm:justify-end sm:gap-2.5">
          <button
            className="min-h-11 rounded-full border border-[var(--pw-border-strong)] bg-[var(--pw-surface-strong)] px-4 py-2 text-sm font-medium text-[var(--pw-text)] shadow-sm transition hover:border-[var(--pw-secondary)] hover:text-[var(--pw-primary)]"
            onClick={openAppearance}
            type="button"
          >
            Appearance
          </button>
          {actions.map((action) => renderAction(action))}
        </div>
      </header>
    );
  }

  return (
    <header className={shellClasses}>
        <div className={cardClasses}>
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
            {showBackButton ? <BackButton fallbackHref={backFallbackHref} label={backLabel} /> : null}
            {resolvedBrandMark ? <div className="shrink-0">{resolvedBrandMark}</div> : null}
            <Link
              className="min-w-0 shrink truncate text-xl font-semibold tracking-tight text-[var(--pw-heading)] sm:text-2xl"
              href={brandHref}
              onClick={handleBrandClick}
            >
              Furvise
            </Link>
            {title ? <div className="hidden text-sm text-[var(--pw-muted)] sm:block">{title}</div> : null}
          </div>

          <div className="hidden items-center gap-6 lg:flex">
            {navItems.length > 0 ? (
              <nav aria-label="Homepage sections" className="flex items-center gap-6">
                {navItems.map((item) => renderNavItem(item))}
              </nav>
            ) : null}

            <div className="flex items-center gap-2.5">
              <button
                className={`min-h-11 rounded-full border border-[var(--pw-border-strong)] bg-[var(--pw-surface-strong)] px-4 py-2 text-sm font-medium text-[var(--pw-text)] shadow-sm transition hover:border-[var(--pw-secondary)] hover:text-[var(--pw-primary)] ${
                  homepagePolish ? "lg:px-5 lg:py-2.5 lg:text-[0.95rem]" : ""
                }`}
                onClick={() => {
                  closeAllMenus();
                  openAppearance();
                }}
                type="button"
              >
                Appearance
              </button>
              {actions.map((action) => renderAction(action))}
            </div>
          </div>

          <button
            aria-controls={mobileMenuId}
            aria-expanded={mobileMenuOpen}
            aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--pw-border-strong)] bg-[var(--pw-surface-strong)] text-[var(--pw-text)] shadow-sm transition hover:border-[var(--pw-secondary)] hover:text-[var(--pw-primary)] sm:h-11 sm:w-11 lg:hidden"
            onClick={() => setMobileMenuOpen((value) => !value)}
            type="button"
          >
            <span className="sr-only">{mobileMenuOpen ? "Close menu" : "Open menu"}</span>
            <MenuIcon />
          </button>
        </div>

        {navItems.length > 0 ? (
          <div
            className={`lg:hidden ${
              mobileMenuOpen ? "pointer-events-auto mt-4 opacity-100" : "pointer-events-none max-h-0 overflow-hidden opacity-0"
            } transition duration-200`}
            id={mobileMenuId}
          >
            <div className="rounded-[1.5rem] border border-[var(--pw-border)] bg-[var(--pw-surface-elevated)] p-3 shadow-lg shadow-[var(--pw-shadow)] backdrop-blur-xl">
              <nav aria-label="Homepage sections" className="grid gap-2">
                {navItems.map((item) => renderNavItem(item, true))}
              </nav>

              <div className="mt-3 grid gap-2 border-t border-[var(--pw-border)] pt-3">
                <button
                  className="min-h-11 rounded-full border border-[var(--pw-border-strong)] bg-[var(--pw-surface-strong)] px-4 py-2 text-sm font-medium text-[var(--pw-text)] shadow-sm transition hover:border-[var(--pw-secondary)] hover:text-[var(--pw-primary)]"
                  onClick={handleAppearanceClick}
                  type="button"
                >
                  Appearance
                </button>
                {actions.map((action) => renderAction(action, true))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </header>
  );
}

function MenuIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path d="M5 7h14" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path d="M5 12h14" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path d="M5 17h14" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function AccountMenuIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path
        d="M12 13.5a4.5 4.5 0 1 0-0.001-9.001A4.5 4.5 0 0 0 12 13.5Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <path
        d="M4.75 19.25c1.6-3 4.1-4.5 7.25-4.5s5.65 1.5 7.25 4.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function DefaultBrandMark() {
  return (
    <Image
      alt=""
      aria-hidden="true"
      className="h-9 w-9 rounded-2xl object-contain"
      height={36}
      priority
      sizes="36px"
      src="/brand/furvise-logo.png"
      width={36}
    />
  );
}
