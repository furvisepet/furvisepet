import Link from "next/link";
import type { ReactNode, RefObject } from "react";
import { BrandMark } from "../components/brand-mark";
import type { AddPetDraftV2 } from "../lib/onboarding-drafts";

export function OnboardingViewport({ children }: { children: ReactNode }) {
  return <main className="onboarding-shell grid min-h-[100svh] w-full place-items-center overflow-x-hidden bg-[var(--surface-page)] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pl-[max(0.75rem,env(safe-area-inset-left,0px))] pr-[max(0.75rem,env(safe-area-inset-right,0px))] pt-[max(0.75rem,env(safe-area-inset-top,0px))] text-[var(--text-primary)] sm:px-8 sm:pb-[8svh] sm:pt-[4svh]" data-ui="quick-start-onboarding-shell">{children}</main>;
}

export function OnboardingSurface({ children, complete = false, contentRef, footer, headingId, state, step }: {
  children: ReactNode;
  complete?: boolean;
  contentRef?: RefObject<HTMLDivElement | null>;
  footer: ReactNode;
  headingId: string;
  state?: "success";
  step?: AddPetDraftV2["step"];
}) {
  return <section aria-labelledby={headingId} className="grid h-[calc(100svh_-_1.5rem_-_env(safe-area-inset-top,0px)_-_env(safe-area-inset-bottom,0px))] w-full max-w-[780px] grid-rows-[auto_auto_minmax(0,1fr)_auto] overflow-hidden rounded-[1.75rem] border border-[var(--line)] bg-[var(--surface-primary)] shadow-[var(--shadow-surface-1)] sm:h-[min(640px,calc(100svh_-_120px))] sm:rounded-3xl" data-onboarding-step={step === undefined ? undefined : step + 1} data-post-create-state={state} data-ui="onboarding-surface">
    <div className="flex h-20 shrink-0 items-center justify-center px-6 sm:h-24 sm:px-10" data-ui="onboarding-brand-zone"><Link aria-label="Furvise home" className="flex min-h-11 min-w-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]" href="/"><span className="inline-flex [--brand-mark-size:1.875rem] sm:[--brand-mark-size:2rem]"><BrandMark className="onboarding-brand" priority showName={false} size={30} /></span></Link></div>
    <div className="flex h-12 shrink-0 items-center px-6 sm:h-14 sm:px-10" data-ui="onboarding-progress-zone"><OnboardingProgress complete={complete} step={step} /></div>
    <div className="scroll-mt-24 min-h-0 min-w-0 overflow-y-auto px-6 pb-5 pt-5 sm:px-10 sm:pb-6 sm:pt-6" data-ui="onboarding-content-zone" ref={contentRef}>{children}</div>
    <div data-ui="onboarding-footer-zone">{footer}</div>
  </section>;
}

export function OnboardingFooter({ primary, secondary }: { primary: ReactNode; secondary: ReactNode }) {
  return <footer className="border-t border-[var(--line)] bg-[var(--surface-primary)] px-6 pb-4 pt-3 sm:px-10 sm:pb-4 sm:pt-3" data-ui="onboarding-footer"><div className="w-full">{primary}</div><div className="mt-1">{secondary}</div></footer>;
}

function OnboardingProgress({ complete = false, step = 0 }: { complete?: boolean; step?: AddPetDraftV2["step"] }) {
  return <div aria-label={complete ? "Setup complete" : `Step ${step + 1} of 4`} className="flex w-full items-center gap-3"><span className="shrink-0 text-xs font-semibold text-[var(--text-secondary)]">{complete ? "Setup complete" : `Step ${step + 1} of 4`}</span><div aria-valuemax={4} aria-valuemin={1} aria-valuenow={complete ? 4 : step + 1} className="grid flex-1 grid-cols-4 gap-1" role="progressbar">{[0, 1, 2, 3].map((index) => <span aria-hidden="true" className={`h-1.5 rounded-full ${complete || index <= step ? "bg-[var(--selection-strong)]" : "bg-[var(--line)]"}`} key={index} />)}</div></div>;
}
