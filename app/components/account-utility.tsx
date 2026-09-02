"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { signOutOfFurvise } from "../lib/sign-out";
import { getBrowserSupabase } from "../lib/supabase";

export function AccountUtility({ email }: { email?: string | null }) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);
  const menuId = useId();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    function closeMenu(event: MouseEvent) {
      if (detailsRef.current?.contains(event.target as Node)) return;
      if (detailsRef.current) detailsRef.current.open = false;
    }

    function closeWithEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || !detailsRef.current?.open) return;
      event.preventDefault();
      detailsRef.current.open = false;
      summaryRef.current?.focus();
    }

    document.addEventListener("click", closeMenu);
    document.addEventListener("keydown", closeWithEscape);
    return () => {
      document.removeEventListener("click", closeMenu);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, []);

  function close() {
    if (detailsRef.current) detailsRef.current.open = false;
  }

  async function signOut() {
    const client = getBrowserSupabase();
    if (!client || signingOut) return;
    setSigningOut(true);
    setError("");
    try {
      await signOutOfFurvise(client);
      window.location.replace("/");
    } catch {
      setError("Couldn't sign out. Please try again.");
      setSigningOut(false);
    }
  }

  const identity = email?.trim() || "Signed-in account";
  const initial = email?.trim().slice(0, 1).toUpperCase();

  return (
    <details className="relative" data-ui="account-utility" ref={detailsRef}>
      <summary
        aria-controls={menuId}
        aria-haspopup="menu"
        aria-label="Open account menu"
        className="group flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-overlay)] p-1 text-[var(--deep-forest)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        ref={summaryRef}
      >
        <span className="hidden h-8 w-8 items-center justify-center rounded-full bg-[var(--deep-forest)] text-sm font-bold text-[var(--warm-cream)] lg:inline-flex" aria-hidden="true">
          {initial || <AccountGlyph />}
        </span>
        <span className="inline-flex h-8 w-9 items-center justify-center" aria-hidden="true">
          <span className="flex items-center gap-1"><i className="h-1 w-1 rounded-full bg-current" /><i className="h-1 w-1 rounded-full bg-current" /><i className="h-1 w-1 rounded-full bg-current" /></span>
        </span>
      </summary>

      <div className="absolute right-0 top-[calc(100%+0.5rem)] z-[var(--z-popover)] w-72 max-w-[calc(100vw-2rem)] rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-overlay)] p-2 shadow-[var(--shadow-floating)]" id={menuId} role="menu">
        <p className="truncate px-3 py-2 text-xs leading-5 text-[var(--text-muted)]" role="none">{identity}</p>
        <MenuLink href="/account" label="Account settings" onClick={close} />
        <MenuLink href="/membership" label="Membership" onClick={close} />
        <div aria-hidden="true" className="my-1 border-t border-[var(--border-subtle)]" />
        <MenuLink href="/privacy" label="Privacy" onClick={close} />
        <MenuLink href="/terms" label="Terms" onClick={close} />
        <div aria-hidden="true" className="my-1 border-t border-[var(--border-subtle)]" />
        <button className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:text-[var(--disabled-text)]" disabled={signingOut} onClick={() => void signOut()} role="menuitem" type="button">
          {signingOut ? "Signing out..." : "Sign out"}
        </button>
        {error ? <p className="px-3 py-2 text-xs leading-5 text-[var(--danger-text)]" role="alert">{error}</p> : null}
      </div>
    </details>
  );
}

function MenuLink({ href, label, onClick }: { href: string; label: string; onClick: () => void }) {
  return <Link className="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" href={href} onClick={onClick} role="menuitem">{label}</Link>;
}

function AccountGlyph() {
  return (
    <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 16 16" width="16">
      <circle cx="8" cy="5.25" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3.5 13c.55-2.1 2.05-3.15 4.5-3.15s3.95 1.05 4.5 3.15" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  );
}
