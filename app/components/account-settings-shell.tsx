"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppPage } from "./app-page";
import { PageHeader } from "./product-primitives";

const SETTINGS_DESTINATIONS = [
  { href: "/account", label: "Account details" },
  { href: "/settings/security", label: "Login & security" },
  { href: "/settings/data-privacy", label: "Data & privacy" },
] as const;

export function AccountSettingsShell({
  children,
  description,
  title,
}: {
  children: React.ReactNode;
  description?: string;
  title: string;
}) {
  const pathname = usePathname();
  const current = SETTINGS_DESTINATIONS.find((item) => pathname === item.href) || SETTINGS_DESTINATIONS[0];

  return (
    <AppPage shell="reading">
      <PageHeader supportingText="Manage your Furvise account." title="ACCOUNT SETTINGS" />

      <details className="group mt-8 border-y border-[var(--line)] lg:hidden" data-ui="mobile-settings-navigation">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 text-sm font-semibold text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
          <span>{current.label}</span>
          <span aria-hidden="true" className="text-[var(--forest)] transition-transform group-open:rotate-180">↓</span>
        </summary>
        <nav aria-label="Account settings" className="border-t border-[var(--line)] py-2">
          {SETTINGS_DESTINATIONS.map((item) => <SettingsLink current={pathname === item.href} item={item} key={item.href} mobile />)}
        </nav>
      </details>

      <div className="mt-10 grid min-w-0 gap-12 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-16 xl:gap-24">
        <aside className="hidden lg:block">
          <nav aria-label="Account settings" className="sticky top-28 grid gap-1 border-t border-[var(--line)] pt-4" data-ui="desktop-settings-navigation">
            {SETTINGS_DESTINATIONS.map((item) => <SettingsLink current={pathname === item.href} item={item} key={item.href} />)}
          </nav>
        </aside>

        <main className="min-w-0 pb-16" data-ui="settings-content">
          <header className="border-b border-[var(--line)] pb-7">
            <h1 className="text-3xl font-semibold tracking-[-0.035em] text-[var(--text-primary)] sm:text-4xl">{title}</h1>
            {description ? <p className="mt-3 max-w-[680px] leading-7 text-[var(--text-secondary)]">{description}</p> : null}
          </header>
          {children}
        </main>
      </div>
    </AppPage>
  );
}

function SettingsLink({
  current,
  item,
  mobile = false,
}: {
  current: boolean;
  item: (typeof SETTINGS_DESTINATIONS)[number];
  mobile?: boolean;
}) {
  return (
    <Link
      aria-current={current ? "page" : undefined}
      className={`${mobile ? "px-3" : "px-2"} flex min-h-12 items-center border-l-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${current ? "border-[var(--deep-forest)] text-[var(--deep-forest)]" : "border-transparent text-[var(--text-secondary)] hover:border-[var(--sage)] hover:text-[var(--text-primary)]"}`}
      href={item.href}
    >
      {item.label}
    </Link>
  );
}
