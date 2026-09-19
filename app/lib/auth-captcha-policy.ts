/** One deployment setting for the forms and server. Authentication and rate limits remain mandatory. */
export function isAuthCaptchaEnabled(env: { NEXT_PUBLIC_AUTH_CAPTCHA_ENABLED?: string } = {
  NEXT_PUBLIC_AUTH_CAPTCHA_ENABLED: process.env.NEXT_PUBLIC_AUTH_CAPTCHA_ENABLED,
}) {
  return env.NEXT_PUBLIC_AUTH_CAPTCHA_ENABLED !== "false";
}
