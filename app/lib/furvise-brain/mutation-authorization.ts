import { ownerDeclinesPersistence, unquotedOwnerText } from "../ai/owner-assertion.ts";
import { splitSentencesPreservingFacts } from "../ai/text-segmentation.ts";
import type { FurviseAuthorizationSource } from "./turn-authority.ts";

export type FurviseMutationAuthorizationEvidence = Readonly<{
  kind: "record_care" | "cancel_pending";
  source: FurviseAuthorizationSource;
  evidence: string;
}>;

const englishSaveCommand = /^(?:(?:(?:and|but|then)\s+)?(?:please|also|yes|okay|ok)[,!]?\s+|(?:(?:and|but|then)\s+)|(?:can|could|would|will)\s+you\s+|i\s+(?:just\s+)?want\s+(?:you\s+)?to\s+)*(?:(?:save|log|record|store)\b|add\b[\s\S]{0,100}\b(?:this|that|it|note|history|record|timeline|entry|observation|update)\b|keep\b[\s\S]{0,100}\b(?:as|in|to)\b[\s\S]{0,60}\b(?:note|record|history|timeline)\b|put\b[\s\S]{0,100}\b(?:in|into|on|as)\b[\s\S]{0,60}\b(?:note|record|history|timeline)\b)/iu;
const spanishSaveCommand = /^(?:(?:por\s+favor|también|si|sí)[,!:;]?\s*)*(?:gu[aá]rd(?:a|alo|ala|alos|alas)|registra|anota|a[nñ]ade|agrega)\b/iu;
const frenchSaveCommand = /^(?:(?:s['’]il\s+te\s+pla[iî]t|s['’]il\s+vous\s+pla[iî]t|merci|aussi)[,!:;]?\s*)*(?:sauvegarde|enregistre|note|ajoute)\b/iu;
const germanSaveCommand = /^(?:(?:bitte|auch)[,!:;]?\s*)*(?:speichere|protokolliere|notiere|f[uü]ge)\b/iu;
const portugueseSaveCommand = /^(?:(?:por\s+favor|tamb[eé]m)[,!:;]?\s*)*(?:salva|salve|registra|registre|anota|anote|adiciona|adicione)\b/iu;
const italianSaveCommand = /^(?:(?:per\s+favore|anche)[,!:;]?\s*)*(?:salva|registra|annota|aggiungi)\b/iu;
const japaneseSaveCommand = /(?:記録(?:に)?(?:残して|して)|保存して|メモ(?:に)?(?:して|残して)|追加して)/u;
const saveConditional = /^(?:if|unless|suppose|supposing|assuming|imagine|even\s+if)\b|\b(?:save|log|record|add|store|keep|put)\b[\s\S]{0,100}\b(?:only\s+if|unless)\b/iu;
const saveMetaDiscussion = /^(?:what|why|how|when|where|which|who|did|do|does|has|have|is|are|was|were|should|would)\b/iu;
const saveHypothetical = /\b(?:hypothetical|fictional|pretend|suppose|example|translate|translation)\b/iu;

/**
 * Return the exact current-user clause that deterministically authorizes a care
 * record mutation. This is intentionally narrower than semantic intent.
 *
 * The language model may propose a save, but it cannot manufacture this proof.
 */
export function findExplicitCareRecordAuthorization(message: string): string | null {
  const source = String(message || "").normalize("NFKC").trim();
  if (!source || ownerDeclinesPersistence(source)) return null;
  const unquoted = unquotedOwnerText(source);
  if (saveHypothetical.test(unquoted)) return null;

  for (const rawSentence of splitSentencesPreservingFacts(unquoted)) {
    const sentence = rawSentence.trim();
    if (!sentence || saveConditional.test(sentence) || saveMetaDiscussion.test(sentence)) continue;
    if (englishSaveCommand.test(sentence)
      || spanishSaveCommand.test(sentence)
      || frenchSaveCommand.test(sentence)
      || germanSaveCommand.test(sentence)
      || portugueseSaveCommand.test(sentence)
      || italianSaveCommand.test(sentence)
      || japaneseSaveCommand.test(sentence)) return rawSentence.trim();
  }
  return null;
}

const cancelCommand = /^(?:(?:and|but)\s+)?(?:(?:please|ok(?:ay)?|yes)[,!]?\s*)?(?:cancel(?:\s+(?:that|it|the\s+(?:save|note)))?|never\s*mind|forget\s+(?:that|it)|don['’]?t\s+(?:save|keep|record|log|store|add)\b|do\s+not\s+(?:save|keep|record|log|store|add)\b|stop\s+(?:the\s+)?(?:save|saving|note|recording))\b/iu;

/** Pending-task cancellation is also a write to workflow state, so it needs a
 * current user instruction rather than a model-only intent label. */
export function findExplicitPendingTaskCancellation(message: string): string | null {
  const source = String(message || "").normalize("NFKC").trim();
  if (!source) return null;
  const unquoted = unquotedOwnerText(source);
  for (const rawSentence of splitSentencesPreservingFacts(unquoted)) {
    const sentence = rawSentence.trim();
    if (sentence && cancelCommand.test(sentence)) return rawSentence.trim();
  }
  return null;
}
