"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="m-0 bg-[var(--surface-page)] text-[var(--text-primary)]">
        <title>Something went wrong | Furvise</title>
        <main className="flex min-h-screen items-center justify-center p-6">
          <section
            aria-labelledby="global-error-title"
            className="w-full max-w-lg rounded-[var(--radius-xl)] border border-[var(--line)] bg-[var(--surface-primary)] p-6 text-center shadow-[var(--shadow-surface-1)] sm:p-10"
          >
            <p className="mb-3 text-sm font-bold tracking-wide text-[var(--ghost-action-foreground)]">Furvise</p>
            <h1 className="m-0 text-3xl font-semibold leading-tight sm:text-5xl" id="global-error-title">Something went wrong</h1>
            <p className="mx-auto mt-4 max-w-md text-base leading-7 text-[var(--text-secondary)]">
              Furvise ran into an unexpected problem. Refresh the page or try again in a moment.
            </p>
            <button
              className="mt-7 inline-flex min-h-12 items-center justify-center rounded-full bg-[var(--action-primary)] px-6 py-3 text-base font-semibold text-[var(--text-inverse)] transition hover:bg-[var(--action-primary-hover)] active:bg-[var(--action-primary-active)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pw-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-page)]"
              onClick={() => window.location.reload()}
              type="button"
            >
              Refresh page
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
