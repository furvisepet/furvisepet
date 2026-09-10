/** Shared response formats and public messages. No persistence or factual authority. */
import type { AskEvidenceContract } from "./intelligence/ask-evidence.ts";

export const FURVISE_PRODUCT_USAGE_CAP_MESSAGE =
  "You have used this month's AI credits. Product browsing and matching are still available.";

export const FURVISE_PRODUCT_GUIDANCE_UNAVAILABLE_MESSAGE =
  "Product guidance is temporarily unavailable, but you can still search the catalog.";

export const FURVISE_ANSWER_UNAVAILABLE_MESSAGE =
  "Furvise couldn't answer just now. Your question has not been lost.";

export const FURVISE_ASK_UNAVAILABLE_MESSAGE =
  "Ask Furvise is temporarily unavailable. Please try again.";

export const FURVISE_MISSING_PRODUCT_DETAILS_MESSAGE =
  "The full product details are not available yet, so check the label before buying or using it.";

export const FURVISE_MISSING_INGREDIENTS_MESSAGE =
  "The full ingredient list is not available yet, so check the package before buying.";

export const FURVISE_MISSING_PRICE_MESSAGE =
  "Check the retailer for the latest price.";

export const FURVISE_MISSING_AVAILABILITY_MESSAGE =
  "Check the retailer for current availability.";

export const FURVISE_MISSING_RETAILER_LINK_MESSAGE =
  "A current retailer link is not available yet.";

export const FURVISE_SEARCH_FALLBACK_MESSAGE =
  "I could not fully understand that search, so I looked through the catalog using the words you typed.";

export const FURVISE_URGENT_SAFETY_MESSAGE =
  "This sounds more important than choosing a product. Contact a veterinarian or emergency clinic now.";

export function buildFurviseSafetyLine(petName = "your pet") {
  const subject = cleanPetName(petName) || "your pet";
  return `Based on what you've saved about ${subject}. Not a substitute for veterinary or professional advice.`;
}

export function buildMissingSavedInformationMessage(petName = "your pet", subject = "that") {
  const name = cleanPetName(petName) || "your pet";
  const detail = String(subject || "that").trim() || "that";
  return `You have not saved anything about ${detail} for ${name} yet.`;
}

export function buildNoSafeProductMatchMessage(petName = "your pet") {
  const name = cleanPetName(petName) || "your pet";
  const details = name === "your pet" ? "your pet's details" : `${name}'s details`;
  return `I could not find a product that fits this search, ${details}, and your product country.`;
}

export function buildFurviseClarification(candidateNames: string[]) {
  const names = [...new Set(candidateNames.map(cleanPetName).filter(Boolean))].slice(0, 4);
  if (names.length < 2) return "I want to make sure I follow the right pet or animal. Who do you mean?";
  if (names.length === 2) return `Do you mean ${names[0]} or ${names[1]}?`;
  return `Do you mean ${names.slice(0, -1).join(", ")}, or ${names.at(-1)}?`;
}

export function buildFurviseCorrectionConfirmation(detail: string) {
  return `Thanks for correcting that. ${String(detail || "I'll use the corrected detail from here.").trim()}`;
}

export function buildFurvisePreferenceConfirmation(detail: string) {
  return `Got it. ${String(detail || "I'll use that preference from here.").trim()}`;
}

export function buildFurviseActionConfirmation(detail: string) {
  return `${String(detail || "That change is ready for your confirmation.").trim()} Nothing changes until you confirm it.`;
}

export function buildFurviseQuotaMessage() {
  return "You've reached your Ask allowance for now. Your pet profiles and saved care history are still available.";
}

export function buildFurviseUnavailableMessage() {
  return "Furvise couldn't finish that answer just now. Your question is still here, so you can try again safely.";
}

function cleanPetName(value: string) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export type AskTextBlock = { kind: "prose"; text: string } | { kind: "code"; text: string; language: string; raw: string };

/** Fenced code is literal content. React renders it as escaped text, never HTML. */
export function splitAskTextBlocks(value: string): AskTextBlock[] {
  const blocks: AskTextBlock[] = [];
  const fence = /^```([a-zA-Z0-9_+-]*)[^\S\r\n]*\r?\n([\s\S]*?)^```[^\S\r\n]*$/gm;
  let start = 0;
  for (const match of value.matchAll(fence)) {
    if (match.index > start) blocks.push({ kind: "prose", text: value.slice(start, match.index) });
    blocks.push({ kind: "code", language: match[1], text: match[2].replace(/\r?\n$/, ""), raw: match[0] });
    start = match.index + match[0].length;
  }
  if (start < value.length) blocks.push({ kind: "prose", text: value.slice(start) });
  return blocks;
}

export function mapAskProse(value: string, transform: (text: string) => string): string {
  return splitAskTextBlocks(value).map(block => {
    if (block.kind === "code") return block.raw;
    if (!block.text.trim()) return block.text;
    const leading = /^\s*/.exec(block.text)![0], trailing = /\s*$/.exec(block.text)![0];
    return leading + transform(block.text.trim()) + trailing;
  }).join("");
}

export function askProseOnly(value: string): string {
  return splitAskTextBlocks(value).filter(block => block.kind === "prose").map(block => block.text).join("\n");
}

/** Bounded plain-text tables. Cells remain text, never HTML or Markdown. */
export function parsePlainTable(text: string): { headers: string[]; rows: string[][] } | null {
  if (text.length > 3600) return null;
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2 || lines.length > 34) return null;
  if (lines.some(line => !/^\s*\|.*\|\s*$/.test(line))) return null;
  const cells = lines.map(line => line.trim().slice(1, -1).split('|').map(cell => cell.trim()));
  const width = cells[0].length;
  if (width < 2 || width > 6 || cells.some(row => row.length !== width)) return null;
  if (!cells[0].every(Boolean)) return null;
  // Reviewers may omit the non-factual separator while retaining every cell.
  const hasSeparator = cells[1].every(cell => /^:?-{3,}:?$/.test(cell));
  const rows = cells.slice(hasSeparator ? 2 : 1);
  if (!rows.length) return null;
  if (rows.some(row => !row.some(Boolean) || row.every(cell => /^:?-{3,}:?$/.test(cell)))) return null;
  return { headers: cells[0], rows };
}

/** Strict CSV records, without executing or interpreting cell content. */
export function parseCsvRecords(text: string): string[][] | null {
  if (!text || text.length > 30000) return null;
  const rows: string[][] = []; let row: string[] = [], cell = "";
  let quoted = false, closed = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else { quoted = false; closed = true; }
      } else cell += ch;
      continue;
    }
    if (ch === "," || ch === "\n" || ch === "\r") {
      row.push(cell); cell = ""; closed = false;
      if (ch !== ",") {
        rows.push(row); row = [];
        if (ch === "\r" && text[i+1] === "\n") i++;
      }
    } else if (closed) return null;
    else if (ch === '"') { if (cell) return null; quoted = true; }
    else cell += ch;
  }
  if (quoted) return null;
  if (row.length || cell || closed) { row.push(cell); rows.push(row); }
  if (rows.length < 2 || rows[0].length < 2 || rows.some(r => r.length !== rows[0].length)) return null;
  return rows;
}


/** Layout changes only: no factual paraphrase, truncation, duplication or reordering. */
type Layout = { style: "paragraph" | "bullets" | "numbered" | "lines"; count?: number };
const counts: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };

export function requestedHistoryLayout(question: string): Layout | null {
  // Only presentation vocabulary is recognized; episode/note quantities are not.
  // Quoted examples are data, not formatting commands.
  const text = question.replace(/"[^"]*"|\u201c[^\u201d]*\u201d/g, "");
  const expression = /\b(?:(no|without)\s+(?:bullets?|lists?)|(one|a single)\s+paragraph|(?:numbered|ordered)\s+list|(?:in|into|as|use|using|give me|make it)\s+(?:(?:exactly|precisely)\s+)?(?:(?:a|an)\s+)?(?:(one|two|three|four|five|six|seven|eight|[1-8])\s+)?(?:(?:short|concise|brief)\s+)?(?:bullet\s+points?|bullets?|points|paragraphs?)|bullet\s+points)\b/gi;
  let layout: Layout | null = null;
  for (const match of text.matchAll(expression)) {
    const value = match[0].toLowerCase();
    if (match[1] || match[2]) layout = { style: "paragraph", count: 1 };
    else if (/numbered|ordered/.test(value)) layout = { style: "numbered" };
    else {
      const token = match[3]?.toLowerCase();
      layout = { style: /paragraph/.test(value) ? "paragraph" : "bullets",
        ...(token ? { count: counts[token] || Number(token) } : {}) };
    }
  }
  if (!layout && /\b(?:a separate line for each|one line (?:for|per) (?:each )?pet|each pet on (?:a|its) (?:separate|own) line)\b/i.test(text)) return { style: "lines" };
  return layout;
}

export function stripHistoryBullet(text: string): string {
  return text.replace(/^\s*(?:[-]\s+(?=[A-Za-z])|[*\u2022]\s+)/, "").trim();
}

export function presentReviewedHistory(sentences: readonly string[], question: string): string {
  if (!sentences.length) return "";
  const table = sentences.join("\n");
  if (parsePlainTable(table)) return table;
  // Keep table rows and nearby prose in distinct blocks. Joining a closing row
  // to its explanation makes an otherwise valid table impossible to render.
  const runs: { table: boolean; texts: string[] }[] = [];
  for (const sentence of sentences) {
    const isTable = sentence.trim().split(/\r?\n/).every(line => /^\s*\|.*\|\s*$/.test(line));
    const last = runs.at(-1);
    if (last?.table === isTable) last.texts.push(sentence);
    else runs.push({ table: isTable, texts: [sentence] });
  }
  if (runs.some(run => run.table && parsePlainTable(run.texts.join("\n")))) {
    return runs.map(run => run.table ? run.texts.join("\n")
      : presentReviewedHistory(run.texts, question)).join("\n\n");
  }
  const layout = requestedHistoryLayout(question);
  // A reviewed item can contain several inline list points. Restore only their
  // layout after review, retaining every word and never splitting quotations.
  if (layout?.style === "bullets") {
    sentences = sentences.flatMap(sentence => /["\u201c\u201d]/.test(sentence) ? [sentence]
      : sentence.split(/(?<=[.!?])\s+-\s+(?=\p{Lu})/u));
  }
  const groups: string[][] = [];
  if (layout?.count) {
    // Never invent points to meet a requested count. Keep every retained sentence.
    const count = Math.min(layout.count, sentences.length);
    for (let i = 0; i < count; i++) {
      const start = Math.floor(i * sentences.length / count);
      const end = Math.floor((i + 1) * sentences.length / count);
      groups.push(sentences.slice(start, end));
    }
  } else if (layout?.style === "bullets" || layout?.style === "numbered" || layout?.style === "lines") {
    for (const sentence of sentences) groups.push([sentence]);
  } else {
    // Longer prose remains readable without splitting a sentence or its numbers.
    for (const sentence of sentences) {
      const last = groups.at(-1);
      if (!last || last.join(" ").length + sentence.length + 1 > 420) groups.push([sentence]);
      else last.push(sentence);
    }
  }
  return groups.map((group, i) =>
    (layout?.style === "bullets" ? "- " : layout?.style === "numbered" ? (i + 1) + ". " : "") + group.join(" ")
  ).join(layout?.style === "bullets" || layout?.style === "numbered" ? "\n" : "\n\n");
}

/** Restore whitespace only when downstream safety/sanitation left every token intact. */
export function preserveReviewedLayout(reviewed: string, sanitized: string): string {
  const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
  if (normalize(reviewed) === normalize(sanitized)) return reviewed;
  // Style cleanup may replace a repeated pet name with a pronoun. Restore
  // line breaks around retained bullet markers without restoring old wording.
  const bullets = reviewed.match(/^- (?=[A-Za-z])/gm) || [];
  const markers = sanitized.match(/(?:^|\s)- (?=[A-Za-z])/g) || [];
  if (bullets.length >= 2 && markers.length === bullets.length && sanitized.startsWith("- ")) {
    return sanitized.replace(/\s+- (?=[A-Za-z])/g, "\n- ");
  }
  return sanitized;
}

/** Preserve the coverage warning while honoring a one-sentence presentation. */
export function presentHistoryLimitation(prose: string, limitation: string, question: string): string {
  if (!limitation) return prose;
  // Two explicitly requested measurements do not claim exhaustive history.
  // Only omit the generic footer; missing-evidence warnings remain visible.
  if (/\b(?:just|only)\s+(?:the\s+)?two\s+weight\s+measurements\b/i.test(question)
    && !/\b(?:all|every|lifetime|first|last|earliest|latest)\b/i.test(question)
    && /^\d+(?:\.\d+)?\s*(?:kg|lb|lbs)\s+(?:and|&)\s+\d+(?:\.\d+)?\s*(?:kg|lb|lbs)\.?$/i.test(prose.trim())
    && limitation === "This covers the matching saved notes I could verify, not necessarily every event in their life.") return prose;
  const oneSentence = /\b(?:one|1|a single|a short|a brief|a concise)\s+sentence\b/i.test(question);
  // Only join a single plain sentence; never flatten tables, lists or quotations.
  if (oneSentence && !/[\n|"\u201c\u201d]/.test(prose) && !/[.!?]\s+\p{Lu}/u.test(prose)
    && !/[.!?]\s+\p{Lu}/u.test(limitation)) {
    const clause = limitation.replace(/^(This|Some|An|A)\b/, word => word.toLowerCase());
    return prose.replace(/[.!?]$/, '') + '; ' + clause;
  }
  return [prose, limitation].filter(Boolean).join('\n\n');
}


export const SAVED_NOTES_HEADING = "Saved notes";

/** Keep a declined answer honest without making raw records the companion's
 * voice. The attributed notes remain intact and part of the validated body. */
export function historyFallbackPresentation(evidence: AskEvidenceContract, text: string) {
  if (!evidence.interpretation?.request || !evidence.answerContent?.length
    || evidence.scope.requestKind === "record_lookup"
    || /\b(?:quote|verbatim|exact wording)\b/i.test(evidence.scope.requestText)) {
    return { summary: text, sections: [] };
  }
  const names = evidence.scope.authorizedPetIds.map(id => evidence.petNames?.[id]).filter(Boolean);
  const subject = names.length === 1 ? names[0] + "'s" : "your pets'";
  return {
    summary: "I'm sorry, I couldn't finish answering that from " + subject + " history. You can check a few of the notes I found below, but they aren't a full answer.",
    sections: [{ heading: SAVED_NOTES_HEADING, items: [text] }],
  };
}

/** Decode a misplaced transport envelope before factual review. Preserve every
 * textual field, and never reinterpret an arbitrary user-requested JSON object. */
export function unwrapProseEnvelope(text: string): string {
  let value: unknown;
  try { value = JSON.parse(text); } catch { return text; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return text;
  const object = value as Record<string, unknown>;
  if (!Object.keys(object).every(key => key === "answer" || key === "note")
    || typeof object.answer !== "string" || !object.answer.trim()
    || object.note !== undefined && object.note !== null && typeof object.note !== "string") return text;
  return [object.answer, typeof object.note === "string" ? object.note : ""].filter(Boolean).join("\n");
}

/** JSON is an output container, not a quotation of its keys. Only objects and
 * arrays qualify; the semantic reviewer still checks every factual value. */
export function isStructuredHistoryText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return false;
  try { const value: unknown = JSON.parse(trimmed); return value !== null && typeof value === "object"; }
  catch { return false; }
}

/** Remove only bracketed annotations composed entirely of known source IDs. */
export function stripKnownHistoryCitations(text: string, ids: Set<string>): string {
  return text.replace(/\s*\[([^\[\]\n]+)\]/g, (match, content: string) => {
    const tokens = content.split(/\s*,\s*/).map(token => token.trim());
    return tokens.length && tokens.every(token => ids.has(token)) ? "" : match;
  });
}


export type AskFailureCode =
  | "INVALID_CURRENT_INPUT"
  | "AUTH_REQUIRED"
  | "PET_UNAVAILABLE"
  | "CLARIFICATION_REQUIRED"
  | "SERVICE_DAILY_LIMIT"
  | "PLAN_LIMIT"
  | "RATE_LIMIT"
  | "TEMPORARY_PROVIDER_FAILURE"
  | "TEMPORARY_DATABASE_FAILURE"
  | "ACTION_FAILED"
  | "ANSWER_RETRYABLE"
  | "REQUEST_IN_PROGRESS";

export type AskInternalFailure =
  | "invalid_input"
  | "auth_required"
  | "pet_unavailable"
  | "clarification_required"
  | "service_daily_limit"
  | "plan_limit"
  | "rate_limit"
  | "provider_failure"
  | "database_failure"
  | "action_failure"
  | "request_in_progress"
  | "answer_retryable";

export type AskErrorPresentation = {
  title: string;
  message: string;
  retryable: boolean;
  recommendedAction: "retry" | "edit" | "wait" | "sign_in" | "saved_data" | "clarify";
  retryAfterSeconds?: number;
};

const publicCodeByFailure: Readonly<Record<AskInternalFailure, AskFailureCode>> = {
  invalid_input: "INVALID_CURRENT_INPUT",
  auth_required: "AUTH_REQUIRED",
  pet_unavailable: "PET_UNAVAILABLE",
  clarification_required: "CLARIFICATION_REQUIRED",
  service_daily_limit: "SERVICE_DAILY_LIMIT",
  plan_limit: "PLAN_LIMIT",
  rate_limit: "RATE_LIMIT",
  provider_failure: "TEMPORARY_PROVIDER_FAILURE",
  database_failure: "TEMPORARY_DATABASE_FAILURE",
  action_failure: "ACTION_FAILED",
  request_in_progress: "REQUEST_IN_PROGRESS",
  answer_retryable: "ANSWER_RETRYABLE",
};

export function publicAskFailureCode(failure: AskInternalFailure) {
  return publicCodeByFailure[failure];
}

export function getAskErrorPresentation(code: AskFailureCode, retryAfterSeconds?: number): AskErrorPresentation {
  const retryAfter = normalizeRetryAfter(retryAfterSeconds);
  switch (code) {
    case "AUTH_REQUIRED": return state("Sign in to continue", "Your session expired. Sign in again to continue with Ask.", false, "sign_in");
    case "INVALID_CURRENT_INPUT": return state("Check this message", "This message could not be sent as written. Review it and try again.", false, "edit");
    case "PET_UNAVAILABLE": return state("Choose another pet", "That pet or conversation is no longer available.", false, "saved_data");
    case "CLARIFICATION_REQUIRED": return state("One detail is missing", "Choose the intended pet so Furvise can continue safely.", false, "clarify");
    case "SERVICE_DAILY_LIMIT": return state("Ask has reached its daily service limit", "Furvise has reached its daily AI limit. Please return after the daily limit resets. Your question is still here, and your saved pet information and history remain available.", false, "saved_data");
    case "PLAN_LIMIT": return state("You've reached your Ask plan limit", buildFurviseQuotaMessage(), false, "saved_data");
    case "RATE_LIMIT": return state("You're sending questions a little too quickly", retryAfter ? `Try again in about ${formatSeconds(retryAfter)}.` : "Wait a moment, then try again.", true, "retry", retryAfter);
    case "REQUEST_IN_PROGRESS": return state("Furvise is still working on this question", retryAfter ? `Please wait about ${formatSeconds(retryAfter)} before checking again.` : "Please wait while the current answer finishes.", false, "wait", retryAfter);
    case "ACTION_FAILED": return state("That action didn't finish", "Your answer is still available. Review the action and try it again when you're ready.", true, "retry");
    case "TEMPORARY_DATABASE_FAILURE": return state("Furvise couldn't finish this answer", "Your question is still here. Try again in a moment.", true, "retry");
    case "TEMPORARY_PROVIDER_FAILURE": return state("Furvise couldn't finish that answer", buildFurviseUnavailableMessage(), true, "retry", retryAfter);
    case "ANSWER_RETRYABLE": return state("Furvise couldn't finish that answer", buildFurviseUnavailableMessage(), true, "retry", retryAfter);
  }
}

function state(title: string, message: string, retryable: boolean, recommendedAction: AskErrorPresentation["recommendedAction"], retryAfterSeconds?: number): AskErrorPresentation {
  return { title, message, retryable, recommendedAction, ...(retryAfterSeconds ? { retryAfterSeconds } : {}) };
}

function normalizeRetryAfter(value: number | undefined) {
  return Number.isFinite(value) && Number(value) > 0 ? Math.min(3600, Math.ceil(Number(value))) : undefined;
}

function formatSeconds(seconds: number) { return `${seconds} second${seconds === 1 ? "" : "s"}`; }

/** Serialize a bounded data-only JSON tree before evidence validation. */
export function serializeHistoricalJson(value: unknown): string {
  const fail = (): never => { throw new Error("INVALID_HISTORY_JSON"); };
  const exact = (value: unknown, keys: string): value is Record<string, unknown> => !!value && typeof value === "object"
    && !Array.isArray(value) && Object.keys(value).sort().join() === keys;
  let count = 0;
  const decode = (input: unknown, depth: number): unknown => {
    if (++count > 128 || depth > 8) return fail();
    if (input === null || typeof input === "boolean") return input;
    if (typeof input === "number") return Number.isFinite(input) ? input : fail();
    if (typeof input === "string") return input.length <= 600 ? input : fail();
    if (exact(input, "items,kind") && input.kind === "array") {
      if (!Array.isArray(input.items) || input.items.length > 24) return fail();
      return input.items.map(item => decode(item, depth + 1));
    }
    if (!exact(input, "entries,kind") || input.kind !== "object" || !Array.isArray(input.entries) || input.entries.length > 24) return fail();
    const keys = new Set<string>();
    return Object.fromEntries(input.entries.map(entry => {
      if (!exact(entry, "key,value") || typeof entry.key !== "string" || !entry.key.length || entry.key.length > 100 || keys.has(entry.key)) return fail();
      keys.add(entry.key);
      return [entry.key, decode(entry.value, depth + 1)];
    }));
  };
  if (!value || typeof value !== "object") return fail();
  const text = JSON.stringify(decode(value, 0));
  if (text.length > 3600) return fail();
  return text;
}
