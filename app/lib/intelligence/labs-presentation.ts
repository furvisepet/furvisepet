/** Presentation only: inputs have already been selected and certified by Labs. */
export type LabsPresentation = "prose" | "list" | "table" | "compact";
export function labsPresentation(format?: string | null): LabsPresentation {
  if (format === "table" || format === "compact" || format === "prose") return format;
  return format ? "list" : "prose";
}
type Row = { id: string; sourceId: string; petId: string; event_at: string; body: string };
export type LabsPresentationGroup = { subject: string; heading: string; rows: Row[]; notice?: string };
// Escape display syntax, never interpret or extract facts from source text.
const inline = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replace(/[\\`*_{}\[\]()#+|~]/g, "\\$&").replace(/\r?\n/g, " ");
export function renderCertifiedLabs(groups: LabsPresentationGroup[], presentation: LabsPresentation, limitations: string[]): string {
  const parts = groups.map(group => {
    const heading = inline(group.heading);
    if (!group.rows.length) return [heading, group.notice && inline(group.notice)].filter(Boolean).join("\n");
    if (presentation === "table") return [heading, "", "| Pet | Recorded note | Date |", "| --- | --- | --- |",
      ...group.rows.map(row => `| ${inline(group.subject)} | ${inline(JSON.stringify(row.body))} | ${inline(row.event_at.slice(0, 10))} |`)].join("\n");
    return [heading, ...(presentation === "list" ? [""] : []), ...group.rows.map(row => {
      const fact = `${inline(group.subject)}: ${inline(JSON.stringify(row.body))} — ${inline(row.event_at.slice(0, 10))}`;
      return presentation === "list" ? "- " + fact : fact;
    })].join(presentation === "prose" ? "\n\n" : "\n");
  });
  return [...parts, ...limitations.map(inline)].filter(Boolean).join("\n\n");
}
