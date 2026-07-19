"use client";

import { useEffect, useRef, useState } from "react";
import type { CareEntryRow, CareEntryWithPetName } from "../lib/supabase";
import {
  formatCareEntryCategory,
  formatCareEntryTimestamp,
  formatCareNotePreview,
  sortCareEntriesNewestFirst,
} from "../lib/care-log.mjs";

type Props = {
  entries: CareEntryRow[] | CareEntryWithPetName[];
  emptyMessage: string;
  onDelete: (entry: CareEntryRow) => void;
  onEdit: (entry: CareEntryRow) => void;
  onOpen: (entry: CareEntryRow) => void;
  petNameById?: Map<string, string>;
  showPetName?: boolean;
};

export function CareTimeline({
  entries,
  emptyMessage,
  onDelete,
  onEdit,
  onOpen,
  petNameById,
  showPetName = false,
}: Props) {
  if (!entries.length) {
    return (
      <p className="rounded-3xl border border-[var(--pw-border)] bg-[var(--pw-surface)] p-6 text-[var(--pw-muted)]">
        {emptyMessage}
      </p>
    );
  }

  const sortedEntries = sortCareEntriesNewestFirst(entries as CareEntryRow[]);

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-[var(--pw-subtle)]">Recent updates</h2>
      <div className="divide-y divide-[var(--pw-border)] rounded-3xl border border-[var(--pw-border)] bg-[var(--pw-surface)] px-5">
        {sortedEntries.map((entry) => (
          <article className="flex items-start gap-2 py-3" key={entry.id}>
            <button
              aria-label={`Open ${entry.title || "update"} details`}
              className="min-w-0 flex-1 rounded-2xl px-2 py-2 text-left transition hover:bg-[var(--pw-card-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pw-primary)]"
              onClick={() => onOpen(entry)}
              type="button"
            >
              <p className="text-sm font-semibold text-[var(--pw-primary)]">
                {formatCareEntryCategory(entry.category)}
                {showPetName ? ` - ${petNameById?.get(entry.pet_profile_id) || "Unknown pet"}` : ""}
              </p>
              <h3 className="mt-1 font-semibold text-[var(--pw-heading)]">{entry.title || "Update"}</h3>
              <p className="mt-1 text-sm leading-6 text-[var(--pw-muted)]">
                {formatCareNotePreview(entry.note, 150)}
              </p>
              <time className="mt-2 block text-sm text-[var(--pw-subtle)]" dateTime={entry.occurred_at}>
                {formatCareEntryTimestamp(entry.occurred_at)}
              </time>
            </button>
            <EntryMenu entry={entry} onDelete={onDelete} onEdit={onEdit} />
          </article>
        ))}
      </div>
    </section>
  );
}

function EntryMenu({
  entry,
  onDelete,
  onEdit,
}: {
  entry: CareEntryRow;
  onDelete: (entry: CareEntryRow) => void;
  onEdit: (entry: CareEntryRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDetailsElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        ref.current?.querySelector("summary")?.focus();
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);
  return (
    <details ref={ref} className="relative shrink-0" onToggle={(event) => setOpen(event.currentTarget.open)} open={open}>
      <summary aria-label="Update actions" className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-full border border-[var(--pw-border)]">
        ...
      </summary>
      <div className="absolute right-0 z-10 mt-2 w-32 rounded-2xl border border-[var(--pw-border)] bg-[var(--pw-surface)] p-2 shadow-xl">
        <button className={itemClass} onClick={() => { setOpen(false); onEdit(entry); }} type="button">Edit</button>
        <button className={`${itemClass} text-[var(--pw-danger-text)]`} onClick={() => { setOpen(false); onDelete(entry); }} type="button">Delete</button>
      </div>
    </details>
  );
}

const itemClass = "inline-flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm font-semibold hover:bg-[var(--pw-card-muted)]";
