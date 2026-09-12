import { mapAskProse } from "./furvise-output.ts";
import { buildAskConversationResponse } from "./ask.mjs";
import { enforceVerifiedStateClaims, preserveAttributedReportQuotes, preserveFictionalDialogueQuotes, containsUntrustedTerminalMutationClaim } from "./application-actions/state-claims.ts";
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

/** Compile presentation before review, using the same serializer as publication.
 * This does not scrub claims or grant approval: the unchanged factual content
 * and the separately enforced mutation policy still require review. */
export function canonicalReadPresentation(text: string): string {
  return buildAskConversationResponse({ title: "Furvise", summary: text, sections: [], safetyNote: null })?.summary || text;
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
