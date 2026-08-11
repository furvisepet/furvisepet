import type { CareEntryRow } from "../supabase.ts";

export type ConcernStatus = "active" | "monitoring" | "resolved" | "reopened" | "dismissed";
export type ConcernSeverity = "routine" | "important" | "urgent";

export type PetConcern = {
  id: string;
  user_id: string;
  pet_profile_id: string;
  title: string;
  normalized_key: string;
  status: ConcernStatus;
  severity: ConcernSeverity;
  source_care_entry_id: string | null;
  opened_at: string;
  updated_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
};

export type PendingUpdateSuggestion = {
  id?: string;
  type: "history" | "memory" | "concern_resolution" | "concern_opening";
  title: string;
  details?: string;
  concernId?: string;
  payload: Record<string, unknown>;
};

export function getCurrentConcern(concerns: PetConcern[]) {
  return concerns
    .filter((concern) => concern.status !== "resolved" && concern.status !== "dismissed")
    .sort((a, b) => concernRank(b) - concernRank(a) || Date.parse(b.updated_at) - Date.parse(a.updated_at))[0] || null;
}

export function buildResolutionSuggestion({ concern, message, petName }: { concern: PetConcern; message: string; petName: string }): PendingUpdateSuggestion {
  const detail = buildResolutionDetail(concern, message, petName);
  const resolvedConcernKeys = [concern.normalized_key];
  if (concern.normalized_key === "breathing" && indicatesRecoveredTemporaryExertion(message)) {
    resolvedConcernKeys.push("extreme_lethargy", "lethargy");
  }
  return {
    type: "concern_resolution",
    title: "Save this improvement",
    details: detail,
    concernId: concern.id,
    payload: {
      category: "symptom",
      concernId: concern.id,
      note: detail,
      resolutionNote: message.trim(),
      resolvedConcernKeys,
      severity: "resolved",
      title: concern.normalized_key === "breathing" ? "Breathing returned to normal" : `${concern.title} resolved`,
    },
  };
}

function indicatesRecoveredTemporaryExertion(message: string) {
  return /\b(?:normal|fine|good|recovered|back to normal)\b/i.test(message) &&
    /\b(?:tired|energy|running|ran|exercise|exertion|rest(?:ed|ing)?)\b/i.test(message);
}

export function buildObservationSuggestion({ message, petName }: { message: string; petName: string }): PendingUpdateSuggestion {
  return {
    type: "history",
    title: "Save this update?",
    details: `${petName}: ${message.trim()}`,
    payload: { category: "general", note: message.trim(), title: "Care update" },
  };
}

export function buildConcernOpeningSuggestion({ message, petName }: { message: string; petName: string }): PendingUpdateSuggestion | null {
  const clean = message.trim();
  const urgent = /\b(trouble breathing|short(ness|age) of breath|labored breathing|open.?mouth breathing|collapse|seizure|severe bleeding|cannot urinate|inability to urinate|toxin|extreme lethargy|repeated vomiting)\b/i.test(clean);
  const important = /\b(symptom|vomit|limp|pain|breath|bleed|seizure|letharg|cannot urinate)\b/i.test(clean);
  if (!urgent && !important) return null;
  return {
    type: "concern_opening",
    title: "Save this concern?",
    details: `${petName}: ${clean}`,
    payload: {
      category: "symptom",
      note: clean,
      severity: urgent ? "severe" : "moderate",
      title: "New care concern",
    },
  };
}

export function buildMemorySuggestion({ message, petName }: { message: string; petName: string }): PendingUpdateSuggestion {
  return {
    type: "memory",
    title: "Remember this detail?",
    details: `${petName}: ${message.trim()}`,
    payload: { memoryType: "preference", note: message.trim() },
  };
}

export function concernFromCareEntry(entry: CareEntryRow): { key: string; severity: ConcernSeverity; title: string } | null {
  const text = `${entry.title || ""} ${entry.note}`;
  const urgent = /\b(trouble breathing|short(ness|age) of breath|labored breathing|open.?mouth breathing|collapse|seizure|severe bleeding|cannot urinate|inability to urinate|toxin)\b/i.test(text);
  if (!urgent && (entry.category !== "symptom" || (entry.severity !== "moderate" && entry.severity !== "severe"))) return null;
  return {
    key: /breath/i.test(text) ? "breathing" : normalizeConcernKey(entry.title || entry.category),
    severity: urgent || entry.severity === "severe" ? "urgent" : "important",
    title: entry.title?.trim() || "Care concern",
  };
}

export function shouldReopenConcern(concern: PetConcern, entry: CareEntryRow) {
  const candidate = concernFromCareEntry(entry);
  return concern.status === "resolved" && candidate?.key === concern.normalized_key;
}

function buildResolutionDetail(concern: PetConcern, message: string, petName: string) {
  if (concern.normalized_key === "breathing") return `Owner reported that ${petName} appears well and is no longer showing the earlier breathing difficulty.`;
  const clean = message.trim().replace(/[.!]+$/, "");
  return `${petName} ${clean.charAt(0).toLowerCase()}${clean.slice(1)}.`;
}

function normalizeConcernKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "care_concern";
}

function concernRank(concern: PetConcern) {
  const severity = concern.severity === "urgent" ? 30 : concern.severity === "important" ? 20 : 10;
  const status = concern.status === "reopened" ? 3 : concern.status === "active" ? 2 : 1;
  return severity + status;
}
