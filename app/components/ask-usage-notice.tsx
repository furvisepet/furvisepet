import Link from "next/link";
import type { AiCreditStatus } from "../lib/ai/usage-ledger";

export function AskUsageNotice({ petId, usage }: { petId: string; usage: Pick<AiCreditStatus, "limit" | "planId" | "remaining" | "resetAt"> }) {
  if (usage.remaining === 0) {
    const encodedPet = encodeURIComponent(petId);
    const resetDate = formatResetDate(usage.resetAt);
    return (
      <section aria-label="AI credit allowance" className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--surface-primary)] p-4">
        <p className="font-semibold text-[var(--text-primary)]">
          You&apos;ve used the {usage.limit} Ask included in your {usage.planId === "plus" ? "Furvise Plus" : "Free"} allowance.
          {resetDate ? ` Your allowance resets ${resetDate}.` : " Your pet profiles, history, and saved details are still available."}
        </p>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">Share the full picture in each Ask for more personalized answers and a more useful pet history.</p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold">
          {usage.planId === "free" ? <Link className={noticeLink} href="/account#plans">Upgrade to Plus</Link> : null}
          <Link className={noticeLink} href="/care-log">View care history</Link>
          <Link className={noticeLink} href={`/pets/${encodedPet}/edit`}>Update pet details</Link>
          <Link className={noticeLink} href={`/vet-brief?pet=${encodedPet}&source=ask-limit`}>Prepare vet brief</Link>
        </div>
      </section>
    );
  }
  return null;
}

function formatResetDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "long", timeZone: "UTC" }).format(date);
}

const noticeLink = "inline-flex min-h-11 items-center text-[var(--pw-primary)] underline decoration-transparent underline-offset-4 hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pw-focus-ring)]";
