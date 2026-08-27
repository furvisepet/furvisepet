import Link from "next/link";
import { BrandMark } from "./brand-mark";
import { PageShell } from "./product-primitives";

export const accountInputClass =
  "min-h-12 w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-background)] px-4 text-base text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-tertiary)] focus:border-[var(--focus-ring)] focus-visible:ring-2 focus-visible:ring-[var(--pw-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-page)]";

export const accountPrimaryClass =
  "inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[var(--action-primary)] px-5 text-base font-semibold text-[var(--text-inverse)] transition hover:bg-[var(--action-primary-hover)] active:bg-[var(--action-primary-active)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pw-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-page)] disabled:cursor-wait disabled:bg-[var(--disabled-surface)] disabled:text-[var(--disabled-text)]";

export const accountSignupPrimaryClass =
  "inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[var(--deep-forest)] px-5 text-base font-semibold text-[var(--warm-cream)] transition hover:bg-[var(--forest)] active:bg-[var(--deep-forest)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pw-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-page)] disabled:cursor-wait disabled:bg-[var(--disabled-surface)] disabled:text-[var(--disabled-text)]";

export function AccountAccessLayout({
  children,
  supportingText,
  title,
  variant = "default",
}: {
  children: React.ReactNode;
  supportingText: React.ReactNode;
  title: string;
  variant?: "default" | "progressive";
}) {
  const progressive = variant === "progressive";

  return (
    <main className="min-h-screen bg-[var(--surface-page)] text-[var(--text-primary)]">
      <PageShell className="flex min-h-screen flex-col" preset="reading">
        <header className="flex min-h-[calc(3.5rem+env(safe-area-inset-top,0px))] items-center border-b border-[var(--line)] pt-[env(safe-area-inset-top,0px)]">
          <Link aria-label="Furvise home" className="inline-flex min-h-11 min-w-11 items-center" href="/">
            <span className="inline-flex items-center [--brand-mark-size:1.5rem] sm:[--brand-mark-size:1.75rem]">
              <BrandMark priority showName={false} size={24} />
            </span>
          </Link>
        </header>
        <section className={progressive ? "flex flex-1 items-start justify-center py-6 sm:items-center sm:py-12" : "flex flex-1 items-center justify-center py-8 sm:py-12"}>
          <div className={progressive ? "w-full max-w-[460px] bg-transparent py-2 sm:rounded-3xl sm:border sm:border-[var(--line)] sm:bg-[var(--surface-primary)] sm:p-8 sm:shadow-[var(--shadow-surface-1)]" : "w-full max-w-[480px] rounded-3xl border border-[var(--line)] bg-[var(--surface-primary)] p-6 shadow-[var(--shadow-surface-1)] sm:p-8"}>
            <h1 className={progressive ? "text-[2.35rem] font-semibold leading-[1.06] tracking-[-0.035em] sm:text-[3rem]" : "text-[2.55rem] font-semibold leading-[1.04] tracking-[-0.035em] sm:text-[3.15rem]"}>{title}</h1>
            <p className="mt-3 text-base leading-7 text-[var(--text-secondary)] sm:text-lg">{supportingText}</p>
            <div className="mt-7">{children}</div>
          </div>
        </section>
      </PageShell>
    </main>
  );
}

export function AccountField({ children, label, name }: { children: React.ReactNode; label: string; name: string }) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-[var(--text-primary)]" htmlFor={name}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function AccountStatus({
  text,
  tone = "neutral",
}: {
  text: string;
  tone?: "neutral" | "warning" | "danger";
}) {
  const toneClasses =
    tone === "warning"
      ? "border-[var(--warning-text)] text-[var(--warning-text)]"
      : tone === "danger"
        ? "border-[var(--danger-text)] text-[var(--danger-text)]"
        : "border-[var(--line)] text-[var(--text-secondary)]";

  return <div aria-live="polite" className={`border-y py-3 text-sm font-medium leading-6 ${toneClasses}`} role="status">{text}</div>;
}
