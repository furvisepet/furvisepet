import { formatCareEntryCategory, formatCareEntryDate, formatCareEntryTime } from "../lib/care-log.mjs";

export function CareEntryMetadata({ category, className = "", occurredAt, petName }: { category: string; className?: string; occurredAt: string; petName: string }) {
  return (
    <span className={`flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs font-medium text-[var(--text-tertiary)] ${className}`} data-ui="care-entry-metadata">
      <span className="font-semibold text-[var(--text-secondary)]">{petName}</span>
      <span aria-hidden="true">·</span>
      <span>{formatCareEntryCategory(category)}</span>
      <span aria-hidden="true">·</span>
      <time dateTime={occurredAt}>{formatCareEntryDate(occurredAt)} <span aria-hidden="true">·</span> {formatCareEntryTime(occurredAt)}</time>
    </span>
  );
}
