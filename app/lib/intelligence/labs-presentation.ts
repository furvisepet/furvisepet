/** Presentation only: inputs have already been selected and certified by Labs. */
export type LabsPresentation = "prose" | "list" | "table" | "compact";
/** Map the validated Ask presentation contract, not arbitrary renderer modes. */
export function labsPresentation(format?: string | null): LabsPresentation | null {
  if (format === undefined || format === null || format === "prose") return "prose";
  if (format === "table") return "table";
  if (format === "bullets") return "list";
  return null;
}
type Row = { id: string; sourceId: string; petId: string; event_at: string; recorded_at?: string; body: string };
export type LabsPresentationGroup = { subject: string; heading: string; rows: Row[]; notice?: string };
// Escape display syntax, never interpret or extract facts from source text.
export const escapeLabsText = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replace(/[\\`*_{}\[\]()#+|~]/g, "\\$&").replace(/\r?\n/g, " ");
export function renderCertifiedLabs(groups: LabsPresentationGroup[], presentation: LabsPresentation, limitations: string[]): string {
  if (!["prose", "list", "table", "compact"].includes(presentation)) throw new Error("LABS_PRESENTATION_UNSUPPORTED");
  const parts = groups.map(group => {
    const heading = escapeLabsText(group.heading);
    if (!group.rows.length) return [heading, group.notice && escapeLabsText(group.notice)].filter(Boolean).join("\n");
    const showSavedAt = group.rows.some(row => row.recorded_at !== undefined);
    if (presentation === "table") return [heading, "",
      "| Pet | Recorded note | Event date |" + (showSavedAt ? " Saved at |" : ""),
      "| --- | --- | --- |" + (showSavedAt ? " --- |" : ""),
      ...group.rows.map(row => `| ${escapeLabsText(group.subject)} | ${escapeLabsText(JSON.stringify(row.body))} | ${escapeLabsText(row.event_at.slice(0, 10))} |`
        + (showSavedAt ? ` ${escapeLabsText(row.recorded_at ?? "Not available")} |` : ""))].join("\n");
    return [heading, ...(presentation === "list" ? [""] : []), ...group.rows.map(row => {
      const fact = `${escapeLabsText(group.subject)}: ${escapeLabsText(JSON.stringify(row.body))} — ${escapeLabsText(row.event_at.slice(0, 10))}`
        + (row.recorded_at ? ` (saved at ${escapeLabsText(row.recorded_at)})` : "");
      return presentation === "list" ? "- " + fact : fact;
    })].join(presentation === "prose" ? "\n\n" : "\n");
  });
  return [...parts, ...limitations.map(escapeLabsText)].filter(Boolean).join("\n\n");
}
