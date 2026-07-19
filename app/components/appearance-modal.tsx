"use client";

import { useEffect } from "react";
import { useAppearance } from "./appearance-provider";
import { Appearance, MODE_OPTIONS } from "../lib/appearance";

export default function AppearanceModal() {
  const {
    appearance,
    closeAppearance,
    isAppearanceOpen,
    previewAppearance,
    resetAppearance,
    saveAppearance,
  } = useAppearance();

  useEffect(() => {
    if (!isAppearanceOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeAppearance();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeAppearance, isAppearanceOpen]);

  if (!isAppearanceOpen) {
    return null;
  }

  function updateDraft(next: Partial<Appearance>) {
    previewAppearance({
      mode: next.mode ?? appearance.mode,
    });
  }

  function apply() {
    saveAppearance(appearance);
  }

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 px-3 py-3 sm:items-center sm:p-6"
      onClick={closeAppearance}
      role="dialog"
    >
      <div
        className="w-full max-w-2xl rounded-[2rem] border border-[var(--pw-border)] bg-[var(--pw-surface-elevated)] shadow-[0_30px_80px_var(--pw-shadow)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b border-[var(--pw-border)] p-5 sm:p-6">
          <h2 className="text-xl font-semibold tracking-tight text-[var(--pw-heading)]">
            Appearance
          </h2>
          <button
            className="rounded-full border border-[var(--pw-border-strong)] bg-[var(--pw-surface-strong)] px-4 py-2 text-sm font-semibold text-[var(--pw-text)] transition hover:border-[var(--pw-secondary)]"
            onClick={closeAppearance}
            type="button"
          >
            Close
          </button>
        </div>

        <div className="space-y-5 p-5 sm:p-6">
          <section className="rounded-[1.5rem] border border-[var(--pw-border)] bg-[var(--pw-card-muted)] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--pw-subtle)]">
              Mode
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {MODE_OPTIONS.map((item) => {
                const selected = appearance.mode === item.name;
                return (
                  <button
                    aria-pressed={selected}
                    className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                      selected
                        ? "border-[var(--pw-primary)] bg-[var(--pw-surface-elevated)] text-[var(--pw-primary)] shadow-sm"
                        : "border-[var(--pw-border)] bg-[var(--pw-surface-strong)] text-[var(--pw-muted)] hover:border-[var(--pw-secondary)] hover:text-[var(--pw-primary)]"
                    }`}
                    key={item.name}
                    onClick={() => updateDraft({ mode: item.name })}
                    type="button"
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </section>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              className="rounded-full border border-[var(--pw-border-strong)] bg-[var(--pw-surface-strong)] px-5 py-3 text-sm font-semibold text-[var(--pw-text)] transition hover:border-[var(--pw-secondary)]"
              onClick={resetAppearance}
              type="button"
            >
              Reset to default
            </button>
            <button
              className="rounded-full border border-transparent bg-[var(--pw-primary)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--pw-primary-hover)]"
              onClick={apply}
              type="button"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
