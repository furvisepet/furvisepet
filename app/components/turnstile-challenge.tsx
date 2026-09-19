"use client";

import Script from "next/script";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { executeTurnstileOnce, type TurnstileExecutionState } from "../lib/turnstile-explicit-execution";

type TurnstileApi = {
  execute(widgetId: string): void;
  render(element: HTMLElement, options: Record<string, unknown>): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
};

declare global { interface Window { turnstile?: TurnstileApi } }

type TurnstileChallengeProps = {
  action?: string;
  executeSignal?: number | null;
  execution?: "execute" | "render";
  onFailure?: () => void;
  onToken: (token: string | null) => void;
  resetSignal: number;
};

export function TurnstileChallenge({ action, executeSignal = null, execution = "render", onFailure, onToken, resetSignal }: TurnstileChallengeProps) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";
  const elementRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  const onFailureRef = useRef(onFailure);
  const executeSignalRef = useRef(executeSignal);
  const executionStateRef = useRef<TurnstileExecutionState>({ lastSignal: null });
  const previousResetSignalRef = useRef(resetSignal);
  const labelId = useId();
  const [renderFailed, setRenderFailed] = useState(false);
  const [widgetReady, setWidgetReady] = useState(false);

  const failChallenge = useCallback(() => {
    onTokenRef.current(null);
    onFailureRef.current?.();
  }, []);

  const executeWidget = useCallback(() => {
    if (execution !== "execute") return;
    try {
      executeTurnstileOnce({
        api: window.turnstile,
        signal: executeSignalRef.current,
        state: executionStateRef.current,
        widgetId: widgetRef.current,
      });
    } catch {
      setRenderFailed(true);
      failChallenge();
    }
  }, [execution, failChallenge]);

  const renderWidget = useCallback(() => {
    if (!siteKey || !elementRef.current || !window.turnstile || widgetRef.current) return;
    try {
      setRenderFailed(false);
      widgetRef.current = window.turnstile.render(elementRef.current, {
        ...(action ? { action } : {}),
        appearance: "interaction-only",
        ...(execution === "execute" ? { execution: "execute" } : {}),
        callback: (token: string) => {
          setRenderFailed(false);
          onTokenRef.current(token);
        },
        "error-callback": () => {
          setRenderFailed(true);
          failChallenge();
        },
        "expired-callback": failChallenge,
        "timeout-callback": failChallenge,
        "unsupported-callback": failChallenge,
        sitekey: siteKey,
        theme: "auto",
      });
      setWidgetReady(true);
      executeWidget();
    } catch {
      widgetRef.current = null;
      setWidgetReady(false);
      setRenderFailed(true);
      failChallenge();
    }
  }, [action, executeWidget, execution, failChallenge, siteKey]);

  const retryWidget = useCallback(() => {
    onTokenRef.current(null);
    setWidgetReady(false);
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
  useEffect(() => { onFailureRef.current = onFailure; }, [onFailure]);

  useEffect(() => {
    executeSignalRef.current = executeSignal;
    let active = true;
    queueMicrotask(() => { if (active) executeWidget(); });
    return () => { active = false; };
  }, [executeSignal, executeWidget]);

  useEffect(() => {
    if (!window.turnstile) return;
    let mounted = true;
    queueMicrotask(() => { if (mounted) renderWidget(); });
    return () => { mounted = false; };
  }, [renderWidget]);

  useEffect(() => {
    if (previousResetSignalRef.current === resetSignal) return;
    previousResetSignalRef.current = resetSignal;
    if (!widgetRef.current || !window.turnstile) return;
    onTokenRef.current(null);
    try {
      window.turnstile.reset(widgetRef.current);
    } catch {
      widgetRef.current = null;
      elementRef.current?.replaceChildren();
      queueMicrotask(() => {
        setWidgetReady(false);
        setRenderFailed(true);
      });
    }
  }, [resetSignal]);

  useEffect(() => () => {
    if (widgetRef.current && window.turnstile) {
      try { window.turnstile.remove(widgetRef.current); } catch { /* The provider may have already discarded a failed widget. */ }
    }
    widgetRef.current = null;
  }, []);

  if (!siteKey) {
    return process.env.NODE_ENV === "production"
      ? <p aria-live="polite" className="text-sm text-[var(--text-secondary)]">The security check is temporarily unavailable. Please try again later.</p>
      : <p className="text-sm text-[var(--text-secondary)]">Local security-check test mode.</p>;
  }

  return (
    <div aria-labelledby={labelId} className="grid gap-2">
      <span className="sr-only" id={labelId}>Security check</span>
      <Script onError={() => { setWidgetReady(false); setRenderFailed(true); failChallenge(); }} onLoad={renderWidget} onReady={renderWidget} src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" />
      <div ref={elementRef} />
      {!widgetReady && !renderFailed ? <span aria-live="polite" className="sr-only">Preparing security check.</span> : null}
      {renderFailed ? (
        <div aria-live="polite" className="grid justify-items-start gap-2 text-sm text-[var(--text-secondary)]" role="alert">
          <p>The security check could not load. Please try again.</p>
          <button className="inline-flex min-h-11 items-center font-semibold text-[var(--ghost-action-foreground)] underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pw-focus-ring)]" onClick={retryWidget} type="button">Retry security check</button>
        </div>
      ) : null}
    </div>
  );
}
