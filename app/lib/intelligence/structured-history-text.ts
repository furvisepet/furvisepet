/** JSON is an output container, not a quotation of its keys. Only objects and
 * arrays qualify; the semantic reviewer still checks every factual value. */
export function isStructuredHistoryText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return false;
  try { const value: unknown = JSON.parse(trimmed); return value !== null && typeof value === "object"; }
  catch { return false; }
}
