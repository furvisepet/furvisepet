import { furviseActionCapabilities } from "../application-actions/policy.ts";
import { FREE_ASK_ALLOWANCE, PLUS_ASK_ALLOWANCE } from "../billing/plan-limits.ts";
export type FurviseCapabilityIntent = "vet_prep_exports" | "long_history_patterns" | "live_product_research";

type VisibleAskAnswer = {
  title: string;
  summary: string;
  sections: Array<{ heading: string; items: string[] }>;
  safetyNote: string | null;
};

const productQuestionContext = /\b(?:furvise|furvise plus|the app|this app|my plan|subscription|feature|capability|available|upgrade|export|download|pdf)\b/i;
const capabilityStatus = /\b(?:planned|roadmap|rollout|not (?:built|available|released|enabled|supported) yet|coming soon|experimental|implementation status|capability status|internal feature)\b/i;
const capabilityNames = /\b(?:longer[- ]history pattern detection|live product research|vet[- ]?prep exports?|planned furvise plus capability)\b/i;

export function classifyFurviseCapabilityQuestion(question: string): FurviseCapabilityIntent | null {
  const normalized = question.normalize("NFKC").trim();
  if (/\b(?:as|in)\s+(?:CSV|JSON|a table|bullets)\b/i.test(normalized)) return null;
  // Format requests are tasks, not subscription/capability questions. Require
  // an explicit availability inquiry instead of treating "export" as intent.
  if (!productQuestionContext.test(normalized) || !/\b(?:(?:can|does|will)\s+(?:furvise|(?:the|this) app)|can I\b[^?!.]{0,100}\b(?:from|in|with)\s+furvise|(?:is|are)\b[^?!.]{0,100}\b(?:available|supported|included)|(?:my plan|subscription)\b[^?!.]{0,80}\b(?:include|support)|what\b[^?!.]{0,60}\b(?:features?|capabilities))\b/i.test(normalized)) return null;
  if (/\b(?:export|pdf|download|printable report|vet[- ]?prep report)\b/i.test(normalized)) return "vet_prep_exports";
  // Addressing Furvise is not, by itself, a question about product availability.
  const historyCapabilityInquiry = /\b(?:plus|my plan|subscription|feature|capability|available|upgrade|supports?|supported|(?:can|does|will)\s+(?:furvise|(?:the|this) app))\b/i.test(normalized);
  if (historyCapabilityInquiry && /\b(?:longer? history|older history|all history|history patterns?|history trends?|patterns? over time)\b/i.test(normalized)) return "long_history_patterns";
  if (/\b(?:live product|research (?:current )?products?|current (?:product )?prices?|retailer|chewy|amazon|walmart)\b/i.test(normalized)) return "live_product_research";
  return null;
}

/** Current shipped capabilities, independent of model-authored product claims. */
export function buildFurviseCapabilityResponse(intent: FurviseCapabilityIntent): VisibleAskAnswer {
  const summaries: Record<FurviseCapabilityIntent, string> = {
    vet_prep_exports: "Vet Brief can prepare a report from your pet's saved records and export it as a PDF. Open Vet Brief to review the report and the access available on your plan.",
    long_history_patterns: "Ask can look up older saved pet records and compare the evidence it finds. An answer depends on the records available; it cannot promise a complete lifetime pattern or fill in undocumented periods.",
    live_product_research: "Furvise does not currently provide live retailer research, current prices, or a live product catalogue.",
  };
  return { title: "Furvise capabilities", summary: summaries[intent], sections: [], safetyNote: null };
}

export function sanitizeInternalProductMetadataFromCareAnswer<T extends VisibleAskAnswer>(answer: T) {
  let removedCount = 0;
  const sanitize = (value: string) => {
    // Do not reserialize safe content: newlines and spacing may be data.
    if (!containsInternalProductMetadata(value)) return value;
    return value.split(/(?<=[.!?])(?=\s)/).filter((sentence) => {
      if (!isInternalProductMetadata(sentence)) return true;
      removedCount += 1;
      return false;
    }).join("").trim();
  };
  const title = isInternalProductMetadata(answer.title) ? (removedCount += 1, "Furvise") : answer.title;
  let summary = sanitize(answer.summary);
  const sections = answer.sections.flatMap((section) => {
    const heading = isInternalProductMetadata(section.heading) ? (removedCount += 1, "") : section.heading;
    const items = section.items.map(sanitize).filter(Boolean);
    return heading && items.length ? [{ heading, items }] : [];
  });
  const safetyNote = answer.safetyNote ? sanitize(answer.safetyNote) || null : null;
  if (!summary && removedCount > 0) {
    summary = sections.flatMap((section) => section.items).find(Boolean)
      || safetyNote
      || "I'll keep this focused on the care question you asked.";
  }
  return { answer: { ...answer, title, summary, sections, safetyNote }, removedCount };
}

export function containsInternalProductMetadata(value: string) {
  return splitVisibleSentences(String(value || "")).some(isInternalProductMetadata);
}

function isInternalProductMetadata(value: string) {
  return capabilityNames.test(value) || (capabilityStatus.test(value)
    && /\b(?:furvise|plus|feature|capability|product research|history pattern|vet[- ]?prep|rollout|roadmap)\b/i.test(value));
}

function splitVisibleSentences(value: string) {
  return value.normalize("NFKC").split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean);
}

/** Shipped product facts are independent of a single turn's permissions.
 * Account-specific remaining usage must still come from the owned ledger. */
export function furviseProductFacts() {
  return {
    actions: furviseActionCapabilities().map(({ kind, confirmationPolicy }) => ({ kind, confirmationPolicy })),
    savedHistory: { supported: true, requiresOwnedPet: true, planWindowApplies: true, undocumentedEventsUnknown: true },
    writes: { supported: true, requireGroundedOwnerIntent: true, completionRequiresReceipt: true },
    navigation: { result: "a usable link", browserMovementConfirmed: false },
    vetBrief: { savedRecordsReport: true, pdfExport: true, planAccessApplies: true },
    liveRetailerResearch: false, otherAccountAccess: false, secretAccess: false,
    allowance: { freeMonthly: FREE_ASK_ALLOWANCE, plusMonthly: PLUS_ASK_ALLOWANCE,
      consumedWhen: "An AI answer is durably saved to the conversation, including a limited answer.",
      failedBeforeAnswerPersistence: "Reservation is released; it does not consume the allowance.",
      actionExecutionFailure: "Separate from answer persistence; never claim the action succeeded.",
      remaining: "Unknown unless supplied from this account's usage ledger." },
  };
}
