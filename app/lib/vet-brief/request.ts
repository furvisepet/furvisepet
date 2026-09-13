export const MAX_VET_BRIEF_REASON_LENGTH = 12_000;

/** Only a completed application failure can retire its retry key.
 * Transport failures and requests still running must retain theirs. */
export function isTerminalVetBriefFailure(status: number, payload: { code?: unknown; error?: unknown } | null) {
  return status === 503 && (payload?.code === 'VET_BRIEF_PREPARATION_FAILED'
    // Earlier releases cached this exact terminal response without a code.
    || payload?.error === 'The Vet Visit Brief could not be prepared right now. Try again in a moment.');
}
