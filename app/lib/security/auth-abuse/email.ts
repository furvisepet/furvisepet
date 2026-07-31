import "server-only";

export function normalizeAuthAbuseEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").trim().toLowerCase();
  if (!normalized || normalized.length > 320 || /[\u0000-\u001f\u007f\s]/u.test(normalized)) return null;
  const at = normalized.indexOf("@");
  if (at < 1 || at !== normalized.lastIndexOf("@") || at > 64) return null;
  const domain = normalized.slice(at + 1);
  if (!domain.includes(".") || domain.startsWith(".") || domain.endsWith(".") || domain.length > 255) return null;
  if (!/^[^@]+@[^@]+$/u.test(normalized)) return null;
  return normalized;
}
