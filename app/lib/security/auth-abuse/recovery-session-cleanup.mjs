export async function finalizeTemporaryRecoverySession(input) {
  let providerSignedOut = false;
  let localStateCleared = false;

  try {
    await input.signOutGlobally();
    providerSignedOut = true;
  } catch { /* Local cleanup must still run after a provider failure. */ }

  try {
    await input.clearLocalState();
    localStateCleared = true;
  } catch { /* The caller must still return the fixed signed-out destination. */ }

  return { localStateCleared, providerSignedOut };
}
