import { evidenceNeedWindow, type EvidenceNeedWindow } from "./evidence-need-window.ts";
/** Advisory retrieval needs, grounded in USER text. They never authorize a
 * subject, date range, mutation or an assertion that a requested fact exists. */
export type EvidenceNeed = { id: string; quote: string; sourceTurnId: string | null; terms: string[]; order?: "earliest" | "latest" | "context"; petIds?: string[]; window?: EvidenceNeedWindow };
export const evidenceNeedsSchema = { type: "array", maxItems: 4, items: { type: "object", additionalProperties: false,
  required: ["quote", "sourceTurnId", "terms", "petNames", "order"], properties: {
    order: { type: "string", enum: ["earliest", "latest", "context"] },
    petNames: { type: "array", maxItems: 3, items: { type: "string", minLength: 1, maxLength: 100 } },
    quote: { type: "string", minLength: 1, maxLength: 400 },
    sourceTurnId: { type: ["string", "null"], maxLength: 160 },
    terms: { type: "array", maxItems: 6, items: { type: "string", minLength: 3, maxLength: 32, pattern: "^[A-Za-z][A-Za-z -]*[A-Za-z]$" } },
  } } };
export function validateEvidenceNeeds(raw: unknown, question: string, turns: readonly { id: string; role: string; text: string }[], referenceIds: readonly string[], scopedPets: readonly { id: string; name: string | null }[] = []) {
  const needs: EvidenceNeed[] = [], issues: string[] = [];
  if (!Array.isArray(raw) || raw.length > 4) return { needs, issues: ["invalid_evidence_needs"] };
  const seen = new Set<string>();
  for (const candidate of raw) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) { issues.push("invalid_evidence_need"); continue; }
    const value = { order: "context", petNames: [], ...candidate };
    if (Object.keys(value).sort().join() !== "order,petNames,quote,sourceTurnId,terms"
      || !["earliest", "latest", "context"].includes(value.order)
      || !Array.isArray(value.petNames) || value.petNames.length > 3 || value.petNames.some((name: unknown) => typeof name !== "string" || !name.trim() || name.length > 100)
      || typeof value.quote !== "string" || !value.quote.trim() || value.quote.length > 400
      || value.sourceTurnId !== null && (typeof value.sourceTurnId !== "string" || value.sourceTurnId.length > 160)
      || !Array.isArray(value.terms) || value.terms.length > 6
      || value.terms.some((term: unknown) => typeof term !== "string" || term.length < 3 || term.length > 32 || !/^[A-Za-z][A-Za-z -]*[A-Za-z]$/.test(term))) {
      issues.push("invalid_evidence_need"); continue;
    }
    const source = value.sourceTurnId === null ? question : referenceIds.includes(value.sourceTurnId)
      ? turns.find(turn => turn.id === value.sourceTurnId && turn.role === "user")?.text : undefined;
    if (!source?.includes(value.quote)) { issues.push("ungrounded_evidence_need"); continue; }
    const matches: Array<typeof scopedPets> = value.petNames.map((name: string) => scopedPets.filter(pet => pet.name?.toLowerCase() === name.toLowerCase()));
    if (matches.some(pets => pets.length !== 1)) { issues.push("unscoped_evidence_need"); continue; }
    const petIds = [...new Set<string>(matches.map(pets => pets[0].id))];
    const key = JSON.stringify([value.sourceTurnId, value.quote, petIds, value.order]);
    if (seen.has(key)) continue;
    seen.add(key);
    const window = evidenceNeedWindow(value.quote);
    needs.push({ ...(window ? { window } : {}), order: value.order, ...(petIds.length ? { petIds } : {}), id: "need:" + needs.length, quote: value.quote, sourceTurnId: value.sourceTurnId,
      terms: [...new Set<string>(value.terms.map((term: string) => term.toLowerCase()))] });
  }
  return { needs, issues: [...new Set(issues)] };
}
