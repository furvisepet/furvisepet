import Link from "next/link";
import { BrandMark } from "./brand-mark";
import { PageShell } from "./product-primitives";

export const accountInputClass =
  "min-h-12 w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-background)] px-4 text-base text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-tertiary)] focus:border-[var(--focus-ring)] focus-visible:ring-2 focus-visible:ring-[var(--pw-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-page)]";

export const accountPrimaryClass =
  "inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[var(--deep-forest)] px-5 text-base font-semibold text-[var(--warm-cream)] transition hover:bg-[var(--forest)] active:bg-[var(--deep-forest)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pw-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-page)] disabled:cursor-wait disabled:bg-[var(--disabled-surface)] disabled:text-[var(--disabled-text)]";

export function AccountAccessLayout({
  children,
  showBrand = false,
  showClose = false,
  supportingText,
  title,
}: {
  children: React.ReactNode;
  showBrand?: boolean;
  showClose?: boolean;
  supportingText: React.ReactNode;
  title: string;
}) {
  return (
    <main className="min-h-[100svh] bg-[var(--surface-page)] text-[var(--text-primary)]">
      <PageShell className="flex min-h-[100svh] items-stretch justify-center px-0 sm:items-center sm:px-8 sm:py-12" preset="reading">
        <section
          className="relative flex min-h-[100svh] w-full flex-col overflow-x-hidden bg-[var(--surface-primary)] px-5 pb-[max(2rem,env(safe-area-inset-bottom,0px))] pt-[max(1.25rem,env(safe-area-inset-top,0px))] sm:min-h-0 sm:max-w-[500px] sm:rounded-3xl sm:border sm:border-[var(--line)] sm:p-9 sm:shadow-[var(--shadow-surface-1)]"
          data-ui="account-access-surface"
        >
          {showClose ? (
            <Link
              aria-label="Close and return to Furvise home"
              className="absolute right-[max(1rem,env(safe-area-inset-right,0px))] top-[max(1rem,env(safe-area-inset-top,0px))] inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-[1.75rem] font-light leading-none text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pw-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-primary)] sm:right-5 sm:top-5"
              href="/"
            >
              <span aria-hidden="true">×</span>
            </Link>
          ) : null}
          <div className={showClose ? "pt-12 sm:pt-10" : "pt-2 sm:pt-0"}>
            {showBrand ? (
              <div className="mb-6 flex justify-center" data-ui="account-access-brand">
                <span className="inline-flex [--brand-mark-size:1.875rem] sm:[--brand-mark-size:2rem]">
                  <BrandMark priority showName={false} size={30} />
                </span>
              </div>
            ) : null}
            <h1 className="text-[2rem] font-semibold leading-[1.08] tracking-[-0.035em] sm:text-[2.375rem]">{title}</h1>
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
