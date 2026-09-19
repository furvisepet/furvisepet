type CaptchaValidation =
  | { allowed: true; bypassed: boolean; token: string | undefined }
  | { allowed: false; code: "CAPTCHA_REQUIRED" };

export function validateCaptchaToken(value: unknown): CaptchaValidation {
  if (typeof value !== "string" || value.length < 10 || value.length > 4096 || /[\u0000-\u001f\u007f]/u.test(value)) {
    return { allowed: false as const, code: "CAPTCHA_REQUIRED" as const };
  }
  return { allowed: true as const, bypassed: false as const, token: value };
}

export function resolveLoginCaptchaPolicy(
  input: Record<string, unknown>,
  challengeRequired: boolean,
  validate: (value: unknown) => CaptchaValidation,
): CaptchaValidation {
  const tokenSupplied = Object.prototype.hasOwnProperty.call(input, "captchaToken");
  if (!challengeRequired && !tokenSupplied) {
    return { allowed: true as const, bypassed: false as const, token: undefined };
  }
  return validate(input.captchaToken);
}
