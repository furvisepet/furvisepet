import { createHmac, timingSafeEqual } from "node:crypto";

export function hasEmailPasswordProvider(user) {
  const metadata = user?.app_metadata || {};
  const providers = Array.isArray(metadata.providers) ? metadata.providers : [metadata.provider];
  return providers.includes("email");
}

export function createAccountPasswordCommitment(password, secret) {
  if (typeof password !== "string" || typeof secret !== "string" || secret.length < 32) return null;
  return createHmac("sha256", secret).update(`account-password-change:${password}`).digest("hex");
}

export function passwordsMatch(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export async function performAccountPasswordChange({ auth, captchaToken, currentPassword, expectedUserId, newPassword }) {
  let reauthentication;
  try {
    reauthentication = await auth.signInWithPassword({
      email: auth.email,
      password: currentPassword,
      options: captchaToken ? { captchaToken } : undefined,
    });
  } catch {
    return { outcome: "provider_failure" };
  }
  if (reauthentication.error) {
    const code = reauthentication.error.code;
    return { outcome: code === "invalid_credentials" || code === "invalid_login_credentials" ? "current_password_invalid" : "provider_failure" };
  }
  if (!reauthentication.data?.session || reauthentication.data.user?.id !== expectedUserId) {
    await auth.signOut({ scope: "local" }).catch(() => null);
    return { outcome: "identity_mismatch" };
  }

  try {
    const update = await auth.updateUser({ password: newPassword });
    if (update.error) return { outcome: "provider_failure" };
  } catch {
    return { outcome: "provider_failure" };
  }

  try {
    const signOut = await auth.signOut({ scope: "others" });
    return { outcome: "completed", otherSessionsSignedOut: !signOut.error };
  } catch {
    return { outcome: "completed", otherSessionsSignedOut: false };
  }
}
