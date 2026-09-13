export const FURVISE_EMAIL_OTP_LENGTH = 6;
export const FURVISE_EMAIL_OTP_PATTERN = new RegExp(`^[0-9]{${FURVISE_EMAIL_OTP_LENGTH}}$`);
export const FURVISE_EMAIL_OTP_HTML_PATTERN = `[0-9]{${FURVISE_EMAIL_OTP_LENGTH}}`;

export function normalizeAuthEmailOtp(value: string) {
  return value.replace(/[^0-9]/g, "").slice(0, FURVISE_EMAIL_OTP_LENGTH);
}

export function isValidAuthEmailOtp(value: unknown): value is string {
  return typeof value === "string" && FURVISE_EMAIL_OTP_PATTERN.test(value);
}

export function isCompleteAuthEmailOtp(value: string) {
  return isValidAuthEmailOtp(value);
}
