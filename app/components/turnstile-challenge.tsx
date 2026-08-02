"use client";

import Script from "next/script";
import { useCallback, useEffect, useId, useRef, useState } from "react";

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
  const [renderFailed, setRenderFailed] = useState(false);
  const [widgetVisible, setWidgetVisible] = useState(false);

  const renderWidget = useCallback(() => {
    if (!siteKey || !elementRef.current || !window.turnstile || widgetRef.current) return;
    try {
      setRenderFailed(false);
      widgetRef.current = window.turnstile.render(elementRef.current, {
        callback: (token: string) => {
          setRenderFailed(false);
          onTokenRef.current(token);
        },
        "error-callback": () => {
          onTokenRef.current(null);
          setRenderFailed(true);
        },
        "expired-callback": () => onTokenRef.current(null),
        sitekey: siteKey,
        theme: "auto",
      });
      setWidgetVisible(true);
    } catch {
      widgetRef.current = null;
      onTokenRef.current(null);
      setWidgetVisible(false);
      setRenderFailed(true);
    }
  }, [siteKey]);

  const retryWidget = useCallback(() => {
    onTokenRef.current(null);
    setWidgetVisible(false);
    if (widgetRef.current && window.turnstile) {
      try { window.turnstile.remove(widgetRef.current); } catch { /* The failed widget may already be gone. */ }
    }
    widgetRef.current = null;
    elementRef.current?.replaceChildren();
    setRenderFailed(false);
    if (window.turnstile) renderWidget();
    else setRenderFailed(true);
  }, [renderWidget]);

  useEffect(() => { onTokenRef.current = onToken; }, [onToken]);

  useEffect(() => {
    if (!window.turnstile) return;
    let mounted = true;
    queueMicrotask(() => { if (mounted) renderWidget(); });
    return () => { mounted = false; };
  }, [renderWidget]);

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
      <Script onError={() => { onTokenRef.current(null); setWidgetVisible(false); setRenderFailed(true); }} onLoad={renderWidget} onReady={renderWidget} src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" />
      <div ref={elementRef} />
      {!widgetVisible && !renderFailed ? <p aria-live="polite" className="text-sm text-[var(--text-secondary)]">Loading security check...</p> : null}
      {renderFailed ? (
        <div aria-live="polite" className="grid justify-items-start gap-2 text-sm text-[var(--text-secondary)]" role="alert">
          <p>The security check could not load. Please try again.</p>
          <button className="inline-flex min-h-11 items-center font-semibold text-[var(--ghost-action-foreground)] underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pw-focus-ring)]" onClick={retryWidget} type="button">Retry security check</button>
        </div>
      ) : null}
    </div>
  );
}
