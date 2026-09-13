"use client";

import { useEffect, useState } from "react";

export function VetBriefLoading({ preparing = false }: { preparing?: boolean }) {
  const [longWait, setLongWait] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setLongWait(true), 30000);
    return () => clearTimeout(timer);
  }, []);
  return <section aria-busy="true" aria-label={preparing ? "Preparing Vet Brief" : "Loading Vet Brief"} className="mt-8 w-full rounded-2xl border border-[var(--pw-border)] bg-[var(--pw-surface)] p-6 sm:p-10">
    <div role="status" className="flex items-start gap-4">
      <span aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 rounded-full border-2 border-[var(--pw-border)] border-t-[var(--pw-primary)] motion-safe:animate-spin" />
      <div><h2 className="text-lg font-semibold">{preparing ? "Preparing your appointment brief" : "Opening your brief"}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--pw-muted)]">{longWait ? "Still working. A detailed history can take a little longer. Keep this page open; your brief will appear here." : preparing ? "We’re reviewing the available history and checking the summary against your records. Your brief will appear here when it’s ready." : "Loading your pet’s brief and saved details."}</p>
      </div>
    </div>
    <div aria-hidden="true" className="mt-8 space-y-8 border-t border-[var(--pw-border)] pt-8 motion-safe:animate-pulse">
      {[0, 1, 2].map(index => <div key={index} className="space-y-3"><div className="h-4 w-36 rounded bg-[var(--pw-card-muted)]" /><div className="h-3 w-full rounded bg-[var(--pw-card-muted)]" /><div className="h-3 w-4/5 rounded bg-[var(--pw-card-muted)]" /><div className="h-3 w-3/5 rounded bg-[var(--pw-card-muted)]" /></div>)}
    </div>
  </section>;
}
