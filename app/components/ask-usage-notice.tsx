import Link from "next/link";
import type { AiCreditStatus } from "../lib/ai/usage-ledger";

export function AskUsageNotice({ petId, usage }: { petId: string; usage: Pick<AiCreditStatus, "limit" | "remaining"> }) {
  if (usage.remaining === 0) {
    const encodedPet = encodeURIComponent(petId);
    return (
      <section aria-label="AI credit allowance" className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--surface-primary)] p-4">
        <p className="font-semibold text-[var(--text-primary)]">You have used this month&apos;s AI credits. Your pet profiles, history, saved details, and non-AI tools are still available.</p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold">
          <Link className={noticeLink} href="/account#plans">Upgrade plan</Link>
          <Link className={noticeLink} href="/care-log">View care history</Link>
          <Link className={noticeLink} href={`/pets/${encodedPet}/edit`}>Update pet details</Link>
          <Link className={noticeLink} href={`/vet-brief?pet=${encodedPet}&source=ask-limit`}>Prepare vet brief</Link>
        </div>
      </section>
    );
  }
  return null;
}

const noticeLink = "inline-flex min-h-11 items-center text-[var(--pw-primary)] underline decoration-transparent underline-offset-4 hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pw-focus-ring)]";
