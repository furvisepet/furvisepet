import type { ModelApplicationAction } from "../application-actions/types.ts";
import { buildFurvisePreferenceConfirmation } from "../furvise-voice.ts";
import type { AskOrchestratorResult } from "./ask-orchestrator.ts";

export type DeterministicAskCommand = {
  routeType: "preference" | "application_action";
  orchestration: AskOrchestratorResult;
  proposals: ModelApplicationAction[];
};

const navigationTargets = [
  { kind: "navigation.open_care_history", label: "care history", pattern: /\b(?:care|health)\s+(?:history|log)\b/iu },
  { kind: "navigation.open_memories", label: "memories", pattern: /\b(?:memories|remembered details)\b/iu },
  { kind: "navigation.open_vet_brief", label: "Vet Brief", pattern: /\b(?:vet(?:erinary)?\s+brief|vet\s+summary)\b/iu },
  { kind: "navigation.open_pet_profile", label: "profile", pattern: /\b(?:pet\s+)?profile\b/iu },
] as const;

export function planDeterministicAskCommand(message: string, petName: string): DeterministicAskCommand | null {
  const normalized = message.normalize("NFKC").replace(/\s+/g, " ").trim();
  const language = explicitAnswerLanguage(normalized);
  if (language) {
    return {
      routeType: "preference",
      orchestration: deterministicResult(
        "Answer language",
        buildFurvisePreferenceConfirmation(`I'll answer in ${language} from here.`),
        "preference",
      ),
      proposals: [{
        kind: "memory.set_preference",
        input: { field: "preferred_language", value: language, title: null, detail: null, category: null, target: null },
        evidence: normalized.slice(0, 240),
        explicitIntent: true,
      }],
    };
  }

  if (!/^(?:please\s+)?(?:open|show|view|go\s+to)\b/iu.test(normalized)) return null;
  const matches = navigationTargets.filter((target) => target.pattern.test(normalized));
  if (matches.length !== 1) return null;
  const target = matches[0];
  return {
    routeType: "application_action",
    orchestration: deterministicResult(
      target.label,
      `Open ${petName}'s ${target.label} below.`,
      "question",
    ),
    proposals: [{
      kind: target.kind,
      input: { field: null, value: null, title: null, detail: null, category: null, target: "selected" },
      evidence: normalized.slice(0, 240),
      explicitIntent: true,
    }],
  };
}

function explicitAnswerLanguage(message: string) {
  const match = /^(?:please\s+)?(?:answer|reply|respond|speak)\s+(?:(?:to\s+)?me\s+)?in\s+([\p{L}][\p{L}\p{M} -]{1,38}?)(?:\s+(?:please|now|from now on))?[.!?]*$/iu.exec(message)
    || /^(?:please\s+)?(?:switch|change|set|use)\s+(?:the\s+)?(?:answer\s+)?language\s+to\s+([\p{L}][\p{L}\p{M} -]{1,38}?)(?:\s+(?:please|now|from now on))?[.!?]*$/iu.exec(message);
  if (!match) return null;
  const value = match[1].trim().replace(/\s+/g, " ");
  return languageNames().has(value.toLocaleLowerCase()) ? `${value.charAt(0).toLocaleUpperCase()}${value.slice(1).toLocaleLowerCase()}` : null;
}

let knownLanguageNames: Map<string, string> | undefined;
/** Validate a language value against the runtime language registry, not a
 * blacklist of units, formats, topics or benchmark phrases. */
function languageNames() {
  if (knownLanguageNames) return knownLanguageNames;
  const names = new Map<string, string>();
  const english = new Intl.DisplayNames(["en"], { type: "language", fallback: "none" });
  for (let a = 97; a <= 122; a++) for (let b = 97; b <= 122; b++) {
    const code = String.fromCharCode(a, b);
    const name = english.of(code);
    if (!name) continue;
    names.set(code, name); names.set(name.toLocaleLowerCase(), name);
    const native = new Intl.DisplayNames([code], { type: "language", fallback: "none" }).of(code);
    if (native) names.set(native.toLocaleLowerCase(), name);
  }
  return knownLanguageNames = names;
}

function deterministicResult(title: string, summary: string, intent: "preference" | "question"): AskOrchestratorResult {
  return {
    aiResult: null,
    answer: { title, summary, sections: [], safetyNote: null },
    concern: null,
    handledWithoutAi: true,
    intent,
    safetyLevel: "normal",
    suggestion: null,
  };
}
