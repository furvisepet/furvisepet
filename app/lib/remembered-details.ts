import type { FurviseMemoryRow } from "./intelligence/types.ts";
import { calculateMemoryFreshness, type FreshnessStatus } from "./intelligence/memory-freshness/calculate-memory-freshness.ts";
import type { DogMemoryRow } from "./supabase.ts";

export type RememberedDetail = {
  id: string;
  source: "canonical" | "legacy";
  subject: "pet" | "owner";
  fact: string;
  editableValue: string;
  category: string;
  freshness: FreshnessStatus;
  needsConfirmation: boolean;
  lastConfirmedAt: string;
};

export type RememberedDetails = {
  pet: RememberedDetail[];
  owner: RememberedDetail[];
  all: RememberedDetail[];
};

const hiddenCategories = new Set(["diagnosis", "medication", "symptom", "temporary symptom"]);

export function buildRememberedDetails({
  canonical,
  legacy = [],
  now = new Date(),
  petName,
}: {
  canonical: FurviseMemoryRow[];
  legacy?: DogMemoryRow[];
  now?: Date;
  petName: string;
}): RememberedDetails {
  const current = canonical.flatMap((memory) => {
    if (!isVisibleCanonicalMemory(memory, now)) return [];
    const freshness = calculateMemoryFreshness(memory, now);
    return [{
      id: memory.id,
      source: "canonical" as const,
      subject: memory.subject_type,
      fact: formatCanonicalMemory(memory, petName),
      editableValue: factValueText(memory.fact_value),
      category: formatCategory(memory.category),
      freshness: freshness.freshnessStatus,
      needsConfirmation: freshness.needsConfirmation || freshness.freshnessStatus === "aging",
      lastConfirmedAt: memory.last_confirmed_at,
    }];
  });
  const seen = new Set(current.map((memory) => normalizeText(memory.fact)));
  const compatible = legacy.flatMap((memory) => {
    const fact = memory.text.replace(/\s+/g, " ").trim();
    if (!fact || hiddenCategories.has((memory.type || "").toLowerCase().trim()) || seen.has(normalizeText(fact))) return [];
    seen.add(normalizeText(fact));
    return [{
      id: memory.id,
      source: "legacy" as const,
      subject: "pet" as const,
      fact,
      editableValue: fact,
      category: formatCategory(memory.type || "detail"),
      freshness: "fresh" as const,
      needsConfirmation: false,
      lastConfirmedAt: memory.created_at,
    }];
  });
  const all = [...current, ...compatible].sort((a, b) => Date.parse(b.lastConfirmedAt) - Date.parse(a.lastConfirmedAt));
  return { all, pet: all.filter((memory) => memory.subject === "pet"), owner: all.filter((memory) => memory.subject === "owner") };
}

export function isVisibleCanonicalMemory(memory: FurviseMemoryRow, now = new Date()) {
  if (memory.status !== "active") return false;
  if (memory.freshness_class === "episode_bound" || memory.freshness_class === "short_lived") return false;
  if (memory.durability === "temporary" || hiddenCategories.has(memory.category.toLowerCase().trim())) return false;
  return calculateMemoryFreshness(memory, now).freshnessStatus !== "expired";
}

export function formatCanonicalMemory(memory: FurviseMemoryRow, petName: string) {
  const value = factValueText(memory.fact_value);
  const key = memory.fact_key.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (key === "prefersdentalchewtexture") return `${petName} prefers ${value.replace(/^softer\b/i, "soft")}`;
  if (key === "preferredstore" || key === "preferredretailer") return `You usually shop at ${value}`;
  if (key === "productbudgetpreference" || key === "budgetpreference") {
    const clearer = value.replace(/unless there is a much better option/i, "unless there is a clearly better option");
    return `You prefer products ${clearer}`;
  }
  const label = humanizeKey(memory.fact_key);
  if (memory.subject_type === "owner") return `You: ${label} ${value}`.trim();
  return `${petName}: ${label} ${value}`.trim();
}

function factValueText(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["text", "value", "name", "preference"]) {
      if (typeof record[key] === "string") return record[key].trim();
    }
  }
  return "a remembered detail";
}

function humanizeKey(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\s+/g, " ").trim().toLowerCase();
}

function formatCategory(value: string) {
  const category = value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return category ? category[0].toUpperCase() + category.slice(1) : "Detail";
}

function normalizeText(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
