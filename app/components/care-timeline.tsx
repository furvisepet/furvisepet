"use client";

import type { CareEntryRow, CareEntryWithPetName } from "../lib/supabase";
import {
  formatCareEntryTitle,
  formatCareNotePreview,
  groupCareEntriesByDate,
} from "../lib/care-log.mjs";
import { EmptyState } from "./product-primitives";
import { OverflowMenu } from "./overflow-menu";
import { LocalPhoto } from "./local-photo";
import { CareEntryMetadata } from "./care-entry-metadata";
import { classifyCareEvent } from "../lib/intelligence/concern-chronology";

type Props = {
  entries: CareEntryRow[] | CareEntryWithPetName[];
  emptyMessage: string;
  onDelete: (entry: CareEntryRow) => void;
  onEdit: (entry: CareEntryRow) => void;
  onOpen: (entry: CareEntryRow) => void;
  petNameById?: Map<string, string>;
  showPetName?: boolean;
};

export function CareTimeline({ entries, emptyMessage, onDelete, onEdit, onOpen, petNameById, showPetName = false }: Props) {
  if (!entries.length) return <EmptyState description={emptyMessage} title="Nothing here yet" />;
  const groups = groupCareEntriesByDate(entries as CareEntryRow[]) as Array<{ label: string; entries: CareEntryRow[] }>;

  return (
    <section aria-label="Recorded care history" className="w-full space-y-8 py-3">
      {groups.map((group) => (
        <section aria-labelledby={`history-${slugify(group.label)}`} key={group.label}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]" id={`history-${slugify(group.label)}`}>
            {group.label}
          </h2>
          <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface-primary)] shadow-[0_8px_24px_var(--shadow)]">
            {group.entries.map((entry) => {
              const title = formatCareEntryTitle(entry);
              const eventType = classifyCareEvent(entry);
              const eventTone = eventType === "recovery"
                ? "border-l-4 border-l-[var(--pw-success-border)] bg-[var(--surface-supportive)]"
                : eventType === "urgent"
                  ? "border-l-4 border-l-[var(--pw-danger-border)] bg-[var(--pw-danger-surface)]"
                  : eventType === "recurrence"
                    ? "border-l-4 border-l-[var(--pw-warning-border)] bg-[var(--pw-warning-surface)]"
                    : "bg-[var(--surface-primary)]";
              return (
                <article className={`flex items-start gap-2 border-b border-[var(--line)] p-4 last:border-b-0 sm:p-5 ${eventTone}`} data-care-state={eventType} key={entry.id}>
                  <button aria-label={`Open ${title} details`} className="min-h-11 min-w-0 flex-1 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" onClick={() => onOpen(entry)} type="button">
                    <CareEntryMetadata category={entry.category} occurredAt={entry.occurred_at} petName={petNameById?.get(entry.pet_profile_id) || (showPetName ? "Pet" : "Selected pet")} />
                    <h3 className="mt-1 font-semibold text-[var(--text-primary)]">{title}</h3>
                    <p className="mt-1 break-words text-sm leading-6 text-[var(--text-secondary)]">{formatCareNotePreview(entry.note, 180)}</p>
                    <LocalPhoto alt={`Photo for ${title}`} className="mt-3 max-h-56 w-full rounded-[var(--radius-md)]" id={entry.id} kind="care" />
                  </button>
                  <EntryMenu entry={entry} onDelete={onDelete} onEdit={onEdit} title={title} />
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </section>
  );
}

function EntryMenu({ entry, onDelete, onEdit, title }: { entry: CareEntryRow; onDelete: (entry: CareEntryRow) => void; onEdit: (entry: CareEntryRow) => void; title: string }) {
  return (
    <OverflowMenu
      ariaLabel={`More actions for ${title}`}
      dataUi="history-entry-menu"
      items={[
        { label: "Edit", onSelect: () => onEdit(entry), type: "item" },
        { type: "separator" },
        { label: "Delete", onSelect: () => onDelete(entry), tone: "danger", type: "item" },
      ]}
    />
  );
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
