export async function performRecoveryPasswordUpdate(input) {
  const claim = await input.claimAuthorization();
  if (claim === "processing") return { outcome: "in_progress" };
  if (claim === "consumed") return { outcome: "authorization_consumed" };
  if (claim === "expired") return { outcome: "authorization_expired" };
  if (claim !== "claimed") return { outcome: "authorization_invalid" };

  let updated = false;
  try { updated = await input.updatePassword(); }
  catch { updated = false; }
  if (!updated) {
    try { await input.releaseAuthorization(); }
    catch { /* The processing marker expires closed and cannot authorize another update. */ }
    return { outcome: "provider_failure" };
  }

  try {
    if (await input.consumeAuthorization()) return { outcome: "completed" };
  } catch { /* Provider success with uncertain marker state must never be retried. */ }
  return { outcome: "reconciliation_required" };
}
