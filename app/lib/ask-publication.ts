import { mapAskProse } from "./furvise-output.ts";
import { buildAskConversationResponse, containsActionDependentCopy } from "./ask.mjs";
import { enforceVerifiedStateClaims, preserveAttributedReportQuotes, preserveFictionalDialogueQuotes, containsUntrustedTerminalMutationClaim, containsUnverifiedStateClaim } from "./application-actions/state-claims.ts";
import { filterSentencesPreservingFacts } from "./ai/text-segmentation.ts";

/** One untrusted-text policy for generation preflight and persisted-message reload.
 * This is not a write receipt; model/stored flags can never disable the policy. */
export function scrubUntrustedMutationClaim(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const governed = enforceVerifiedStateClaims(value, false);
  const safe = mapAskProse(governed, block => preserveFictionalDialogueQuotes(block, text => preserveAttributedReportQuotes(text, prose =>
    filterSentencesPreservingFacts(prose, sentence => !containsUntrustedTerminalMutationClaim(sentence)))));
  return safe || fallback;
}

/** Compile the exact reload-safe text before semantic review. The scrub is a
 * policy transform, not an approval: reviewers still have to establish that
 * every required fact survived it and remains supported by the evidence.
 *
 * Keeping this transform before review prevents harmless presentation cleanup
 * (for example, removing an optional follow-up offer) from forcing a second
 * model repair after the factual answer has already been completed. If the
 * policy removes a required clause or an unverified action claim, the reviewer
 * sees the resulting omission and rejects that final text normally. */
export function canonicalReadPresentation(text: string): string {
  const rendered = buildAskConversationResponse({ title: "Furvise", summary: enforceVerifiedStateClaims(text, false), sections: [], safetyNote: null });
  if (!rendered) return text;
  return scrubUntrustedMutationClaim(rendered.summary, "I can help with that.");
}

/** Exercise the actual serializer and reload text policy BEFORE approving a
 * narrative. An unpublishable draft enters the existing bounded repair path.
 * No mutation flags, receipt restoration or factual rewriting are accepted. */
export function readPublicationFailure(text: string): "serialization" | "publication_changed_text" | null {
  const rendered = buildAskConversationResponse({ title: "Furvise", summary: enforceVerifiedStateClaims(text, false), sections: [], safetyNote: null });
  if (!rendered) return "serialization";
  const visible = scrubUntrustedMutationClaim(rendered.summary, "I can help with that.");
  const normalize = (value: string) => {
    // JSON indentation is presentation; whitespace inside string values is data.
    try { const parsed = JSON.parse(value); if (parsed && typeof parsed === "object") return JSON.stringify(parsed); } catch {}
    return value.replace(/\r\n?/g, "\n").trim();
  };
  return normalize(visible) === normalize(text) ? null : "publication_changed_text";
}

/** Content-free diagnostics identify the stage that changed a rejected draft.
 * No raw patient text, quantities, identifiers or reviewer reasoning is logged. */
export function readPublicationStages(text: string) {
  const governed = enforceVerifiedStateClaims(text, false);
  const rendered = buildAskConversationResponse({ title: "Furvise", summary: governed, sections: [], safetyNote: null });
  const scrubbed = rendered && scrubUntrustedMutationClaim(rendered.summary, "I can help with that.");
  return { statePolicyChanged: governed !== text, serializationChanged: !!rendered && rendered.summary !== governed,
    terminalPolicyChanged: !!rendered && scrubbed !== rendered.summary, serializationFailed: !rendered,
    stateClaimDetected: containsUnverifiedStateClaim(text), actionDependentCopy: containsActionDependentCopy(text),
    terminalClaimDetected: !!rendered && containsUntrustedTerminalMutationClaim(rendered.summary) };
}
