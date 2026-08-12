export type V2RegistryConcept = {
  id: string;
  canonicalKey: string;
  conceptVersion: string;
  lifecycleCapable: boolean;
  speciesApplicability: string[];
  status: "active" | "deprecated";
  aliases: string[];
};

export type V2RegistryResolution = {
  status: "canonical" | "provisional" | "ambiguous" | "unresolved";
  normalizedKey: string;
  concept: V2RegistryConcept | null;
};

/** Exact registry/alias resolution only. No substring, suffix, title, or fuzzy matching. */
export function resolveRegistryConceptV2(
  candidate: string | null | undefined,
  species: string | null,
  registry: readonly V2RegistryConcept[],
): V2RegistryResolution {
  const normalizedKey = normalizeRegistryCandidate(candidate);
  if (!normalizedKey) return { status: "unresolved", normalizedKey: "legacy_unresolved", concept: null };
  const matches = registry.filter((concept) => concept.status === "active"
    && (!species || concept.speciesApplicability.length === 0 || concept.speciesApplicability.includes(species))
    && (concept.canonicalKey === normalizedKey || concept.aliases.includes(normalizedKey)));
  if (matches.length === 1) return { status: "canonical", normalizedKey, concept: matches[0] };
  if (matches.length > 1) return { status: "ambiguous", normalizedKey, concept: null };
  return { status: "provisional", normalizedKey, concept: null };
}

export function normalizeRegistryCandidate(candidate: string | null | undefined) {
  return (candidate || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 120);
}
