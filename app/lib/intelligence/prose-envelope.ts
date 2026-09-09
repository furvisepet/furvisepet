/** Decode a misplaced transport envelope before factual review. Preserve every
 * textual field, and never reinterpret an arbitrary user-requested JSON object. */
export function unwrapProseEnvelope(text: string): string {
  let value: unknown;
  try { value = JSON.parse(text); } catch { return text; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return text;
  const object = value as Record<string, unknown>;
  if (!Object.keys(object).every(key => key === "answer" || key === "note")
    || typeof object.answer !== "string" || !object.answer.trim()
    || object.note !== undefined && object.note !== null && typeof object.note !== "string") return text;
  return [object.answer, typeof object.note === "string" ? object.note : ""].filter(Boolean).join("\n");
}
