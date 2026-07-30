import "server-only";

export const AUTH_PASSWORD_MIN_LENGTH = 12;
export const AUTH_PASSWORD_MAX_LENGTH = 128;

export function validateAuthPassword(value: unknown) {
  if (typeof value !== "string") return { ok: false as const, code: "PASSWORD_INVALID" as const };
  if (value.length < AUTH_PASSWORD_MIN_LENGTH || value.length > AUTH_PASSWORD_MAX_LENGTH) return { ok: false as const, code: "PASSWORD_INVALID" as const };
  return { ok: true as const, password: value };
}
