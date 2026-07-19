"use client";

import { useRouter } from "next/navigation";

type BackButtonProps = {
  className?: string;
  fallbackHref: string;
  label?: string;
};

export function BackButton({
  className = "",
  fallbackHref,
  label = "Back",
}: BackButtonProps) {
  const router = useRouter();

  function handleClick() {
    const historyState = typeof window !== "undefined" ? (window.history.state as { idx?: number } | null) : null;
    if (historyState?.idx && historyState.idx > 0) {
      router.back();
      return;
    }

    router.replace(fallbackHref);
  }

  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--pw-border-strong)] bg-[var(--pw-surface)] px-4 py-2 text-sm font-semibold text-[var(--pw-text)] shadow-sm transition hover:border-[var(--pw-secondary)] hover:text-[var(--pw-primary)] ${className}`}
      onClick={handleClick}
      type="button"
    >
      {label}
    </button>
  );
}
