import Link from "next/link";
import { BrandMark } from "./brand-mark";
import { PageShell, type PageShellPreset } from "./product-primitives";

export function AppFooter({
  shell = "marketing",
  showSignIn = false,
}: {
  shell?: PageShellPreset;
  showSignIn?: boolean;
}) {
  return (
    <footer className="border-t border-[var(--border-subtle)] bg-[var(--footer-background)]" data-ui="app-footer">
      <PageShell className="flex flex-col gap-4 py-6 text-sm text-[var(--text-secondary)] sm:flex-row sm:items-center sm:justify-between" preset={shell}>
        <BrandMark size={24} />
        <nav aria-label="Footer navigation" className="flex min-h-11 items-center gap-5">
          <Link className="inline-flex min-h-11 items-center underline-offset-4 hover:text-[var(--text-primary)] hover:underline" href="/privacy">Privacy</Link>
          <Link className="inline-flex min-h-11 items-center underline-offset-4 hover:text-[var(--text-primary)] hover:underline" href="/terms">Terms</Link>
          {showSignIn ? <Link className="inline-flex min-h-11 items-center font-semibold text-[var(--ghost-action-foreground)] underline-offset-4 hover:underline" href="/login">Sign in</Link> : null}
        </nav>
      </PageShell>
    </footer>
  );
}
