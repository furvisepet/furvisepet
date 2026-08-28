export const SIGNUP_OTP_LENGTH = 6;

export function normalizeSignupOtp(value: string) {
  return value.replace(/[^0-9]/g, "").slice(0, SIGNUP_OTP_LENGTH);
}

export function isCompleteSignupOtp(value: string) {
  return /^[0-9]{6}$/.test(value);
}
