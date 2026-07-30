"use client";

import Script from "next/script";
import { useEffect, useId, useRef } from "react";

type TurnstileApi = {
  render(element: HTMLElement, options: Record<string, unknown>): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
};

declare global { interface Window { turnstile?: TurnstileApi } }

export function TurnstileChallenge({ onToken, resetSignal }: { onToken: (token: string | null) => void; resetSignal: number }) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";
  const elementRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  const labelId = useId();

  function renderWidget() {
    if (!siteKey || !elementRef.current || !window.turnstile || widgetRef.current) return;
    widgetRef.current = window.turnstile.render(elementRef.current, {
      callback: (token: string) => onTokenRef.current(token),
      "error-callback": () => onTokenRef.current(null),
      "expired-callback": () => onTokenRef.current(null),
      sitekey: siteKey,
      theme: "auto",
    });
  }

  useEffect(() => { onTokenRef.current = onToken; }, [onToken]);

  useEffect(() => {
    if (!widgetRef.current || !window.turnstile) return;
    onTokenRef.current(null);
    window.turnstile.reset(widgetRef.current);
  }, [resetSignal]);

  useEffect(() => () => { if (widgetRef.current && window.turnstile) window.turnstile.remove(widgetRef.current); }, []);

  if (!siteKey) {
    return process.env.NODE_ENV === "production"
      ? <p aria-live="polite" className="text-sm text-[var(--text-secondary)]">The security check is temporarily unavailable. Please try again later.</p>
      : <p className="text-sm text-[var(--text-secondary)]">Local security-check test mode.</p>;
  }

  return (
    <div aria-labelledby={labelId} className="grid gap-2">
      <span className="sr-only" id={labelId}>Security check</span>
      <Script onLoad={renderWidget} src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" />
      <div ref={elementRef} />
    </div>
  );
}
