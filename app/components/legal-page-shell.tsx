"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { BrandMark } from "./brand-mark";

export function LegalPageShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  function goBack() {
    if (window.history.length > 1) router.back();
    else router.push("/");
  }
  return <div className="min-h-dvh w-full overflow-x-hidden bg-[var(--surface-page)] text-[var(--text-primary)]">
    <header className="border-b border-[var(--line)] bg-[var(--surface-page)] pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex min-h-16 w-full max-w-[960px] items-center justify-between px-5 sm:px-8">
        <Link aria-label="Furvise home" className="inline-flex min-h-11 items-center" href="/"><BrandMark /></Link>
        <button className="min-h-11 rounded-[var(--radius-sm)] px-3 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" onClick={goBack} type="button">← Back</button>
      </div>
    </header>
    <main className="mx-auto min-h-[calc(100dvh-4rem-env(safe-area-inset-top))] w-full max-w-[760px] px-5 py-10 sm:px-8 sm:py-14">{children}</main>
  </div>;
}
