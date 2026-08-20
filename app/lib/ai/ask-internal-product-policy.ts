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
  const normalized = question.normalize("NFKC");
  if (!productQuestionContext.test(normalized)) return null;
  if (/\b(?:export|pdf|download|printable report|vet[- ]?prep report)\b/i.test(normalized)) return "vet_prep_exports";
  if (/\b(?:longer? history|older history|all history|history patterns?|history trends?|patterns? over time)\b/i.test(normalized)) return "long_history_patterns";
  if (/\b(?:live product|research (?:current )?products?|current (?:product )?prices?|retailer|chewy|amazon|walmart)\b/i.test(normalized)) return "live_product_research";
  return null;
}

export function sanitizeInternalProductMetadataFromCareAnswer<T extends VisibleAskAnswer>(answer: T) {
  let removedCount = 0;
  const sanitize = (value: string) => splitVisibleSentences(value).filter((sentence) => {
    if (!isInternalProductMetadata(sentence)) return true;
    removedCount += 1;
    return false;
  }).join(" ").trim();
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
