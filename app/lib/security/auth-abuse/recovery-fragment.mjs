const MAX_RECOVERY_FRAGMENT_LENGTH = 1024;
const TOKEN_HASH_PATTERN = /^[A-Za-z0-9_-]{32,512}$/;

/**
 * @param {string} fragment
 * @returns {{ ok: true, tokenHash: string, type: "recovery" } | { ok: false, reason: "missing_fragment" | "malformed_recovery_link" }}
 */
export function parseRecoveryFragment(fragment) {
  if (typeof fragment !== "string" || fragment.length === 0) {
    return { ok: false, reason: "missing_fragment" };
  }
  if (!fragment.startsWith("#") || fragment.length > MAX_RECOVERY_FRAGMENT_LENGTH) {
    return { ok: false, reason: "malformed_recovery_link" };
  }

  const recovery = parseRecoveryParameters(new URLSearchParams(fragment.slice(1)));
  return recovery || { ok: false, reason: "malformed_recovery_link" };
}

/** @param {string} body */
export function parseRecoveryFormBody(body) {
  if (typeof body !== "string") return null;
  const recovery = parseRecoveryParameters(new URLSearchParams(body));
  return recovery ? { tokenHash: recovery.tokenHash, type: recovery.type } : null;
}

function parseRecoveryParameters(parameters) {
  if (!hasExactlyOnce(parameters, ["token_hash", "type"])) {
    return null;
  }
  const tokenHash = parameters.get("token_hash") || "";
  if (!TOKEN_HASH_PATTERN.test(tokenHash) || parameters.get("type") !== "recovery") {
    return null;
  }
  return { ok: true, tokenHash, type: /** @type {const} */ ("recovery") };
}

function hasExactlyOnce(parameters, expectedKeys) {
  const keys = [...parameters.keys()];
  return keys.length === expectedKeys.length
    && expectedKeys.every((key) => parameters.getAll(key).length === 1)
    && keys.every((key) => expectedKeys.includes(key));
}

export const RECOVERY_FRAGMENT_LIMITS = {
  maxLength: MAX_RECOVERY_FRAGMENT_LENGTH,
};
