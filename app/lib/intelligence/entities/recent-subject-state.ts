import type { EligibleSemanticPet } from "./candidate-retrieval.ts";

export type SubjectPronounClass = "feminine" | "masculine" | "neutral";

export type RecentSubjectEntity = {
  key: string;
  kind: "pet" | "external_animal";
  petId: string | null;
  label: string;
  species: string | null;
  sex: string | null;
  pronouns: SubjectPronounClass[];
  lastMentionTurn: number;
  lastSubjectTurn: number;
};

export type RecentSubjectState = {
  selectedPetId: string;
  entities: RecentSubjectEntity[];
};

export type RecentPronounResolution =
  | { status: "resolved"; entity: RecentSubjectEntity; candidatePetIds: string[] }
  | { status: "ambiguous"; entity: null; candidatePetIds: string[] }
  | { status: "unresolved"; entity: null; candidatePetIds: string[] };

const externalAnimalPattern = /\b((?:(?:neighbou?r(?:['’]s)?|outside|stray|feral|unknown|another|other)\s+)(?:(male|female)\s+)?(cat|dog|kitten|puppy|animal|pet)|(?:the\s+)?(male|female)\s+(cat|dog|kitten|puppy|animal|pet))\b/giu;

export function buildRecentSubjectState(input: {
  pets: EligibleSemanticPet[];
  recentConversation: Array<{ role?: string; text: string }>;
  selectedPetId: string;
}): RecentSubjectState {
  const entities = new Map<string, RecentSubjectEntity>();
  for (const pet of input.pets) entities.set(petKey(pet.id), petEntity(pet));
  const selected = entities.get(petKey(input.selectedPetId));
  if (!selected) return { selectedPetId: input.selectedPetId, entities: [] };

  const turns = input.recentConversation.filter((turn) => !turn.role || turn.role === "user").slice(-8);
  turns.forEach((turn, turnIndex) => {
    const namedPets = explicitlyNamedPets(turn.text, input.pets);
    for (const pet of namedPets) {
      const entity = entities.get(petKey(pet.id));
      if (entity) entity.lastMentionTurn = turnIndex;
    }

    const externalEntities = extractExternalAnimalEntities(turn.text, entities);
    for (const entity of externalEntities) entity.lastMentionTurn = turnIndex;

    const explicitEntities = [...namedPets.map((pet) => entities.get(petKey(pet.id))!), ...externalEntities];
    const leading = leadingSubjectResolution(turn.text, entities, input.selectedPetId);
    if (leading.status === "resolved") {
      leading.entity.lastSubjectTurn = turnIndex;
    } else if (explicitEntities.length === 1) {
      explicitEntities[0].lastSubjectTurn = turnIndex;
    } else if (explicitEntities.length > 1) {
      for (const entity of explicitEntities) entity.lastSubjectTurn = turnIndex;
    }
  });

  return { selectedPetId: input.selectedPetId, entities: [...entities.values()] };
}

export function resolveRecentPronoun(state: RecentSubjectState, surface: string): RecentPronounResolution {
  const pronoun = pronounClass(surface);
  if (!pronoun) return { status: "unresolved", entity: null, candidatePetIds: [] };
  const compatible = state.entities.filter((entity) => entity.pronouns.includes(pronoun));
  const recentScore = Math.max(-1, ...compatible.map(entityRecencyScore));
  const recent = compatible.filter((entity) => entityRecencyScore(entity) === recentScore && recentScore >= 0);
  if (recent.length === 1) return resolved(recent[0], recent);
  if (recent.length > 1) return ambiguous(recent);
  const selected = compatible.find((entity) => entity.petId === state.selectedPetId);
  return selected ? resolved(selected, [selected]) : { status: "unresolved", entity: null, candidatePetIds: [] };
}

export function pronounClass(surface: string): SubjectPronounClass | null {
  const normalized = normalize(surface);
  if (["she", "her", "hers"].includes(normalized)) return "feminine";
  if (["he", "him", "his"].includes(normalized)) return "masculine";
  if (["they", "them", "their", "theirs", "it", "its"].includes(normalized)) return "neutral";
  return null;
}

export function isExplicitExternalAnimalSurface(surface: string) {
  externalAnimalPattern.lastIndex = 0;
  return externalAnimalPattern.test(surface.normalize("NFKC"));
}

function leadingSubjectResolution(text: string, entities: Map<string, RecentSubjectEntity>, selectedPetId: string): RecentPronounResolution {
  const firstSentence = text.normalize("NFKC").split(/[.!?]/, 1)[0]?.trim() || "";
  const normalizedFirstSentence = normalize(firstSentence);
  const named = [...entities.values()].filter((entity) => entity.kind === "pet" && containsWholeTerm(firstSentence, entity.label));
  const leadingNamed = named.filter((entity) => normalizedFirstSentence.startsWith(normalize(entity.label)));
  const coordinatedNamedSubjects = leadingNamed.length === 1 && named.some((entity) => entity !== leadingNamed[0]
    && normalizedFirstSentence.startsWith(`${normalize(leadingNamed[0].label)} and ${normalize(entity.label)}`));
  if (leadingNamed.length === 1 && !coordinatedNamedSubjects) return resolved(leadingNamed[0], named);
  const external = [...entities.values()].filter((entity) => entity.kind === "external_animal" && containsWholeTerm(firstSentence, entity.label));
  const leadingExternal = external.filter((entity) => normalize(firstSentence).startsWith(normalize(entity.label)));
  if (leadingExternal.length === 1) return resolved(leadingExternal[0], external);
  const leadingPronoun = /^(?:["'“”‘’]\s*)?(she|her|he|him|they|them|it)\b/iu.exec(firstSentence)?.[1];
  if (!leadingPronoun) return { status: "unresolved", entity: null, candidatePetIds: [] };
  return resolveRecentPronoun({ selectedPetId, entities: [...entities.values()] }, leadingPronoun);
}

function extractExternalAnimalEntities(text: string, entities: Map<string, RecentSubjectEntity>) {
  const result: RecentSubjectEntity[] = [];
  externalAnimalPattern.lastIndex = 0;
  for (const match of text.normalize("NFKC").matchAll(externalAnimalPattern)) {
    const surface = match[1].trim();
    const sex = (match[2] || match[4] || "").toLowerCase() || null;
    const species = normalizeSpecies(match[3] || match[5] || "");
    const compatibleExisting = [...entities.values()].filter((entity) => entity.kind === "external_animal"
      && entity.species === species && (!sex || !entity.sex || entity.sex === sex));
    const key = compatibleExisting.length === 1 ? compatibleExisting[0].key : `external:${normalize(surface)}`;
    let entity = entities.get(key);
    if (!entity) {
      entity = {
        key, kind: "external_animal", petId: null, label: surface, species, sex,
        pronouns: pronounsForSex(sex), lastMentionTurn: -1, lastSubjectTurn: -1,
      };
      entities.set(key, entity);
    }
    if (!result.includes(entity)) result.push(entity);
  }
  return result;
}

function petEntity(pet: EligibleSemanticPet): RecentSubjectEntity {
  const sex = normalizeSex(pet.sex);
  return {
    key: petKey(pet.id), kind: "pet", petId: pet.id, label: pet.name || "pet",
    species: normalizeSpecies(pet.species || ""), sex, pronouns: pronounsForSex(sex),
    lastMentionTurn: -1, lastSubjectTurn: -1,
  };
}

function explicitlyNamedPets(message: string, pets: EligibleSemanticPet[]) {
  return pets.filter((pet) => pet.name && containsWholeTerm(message, pet.name));
}

function pronounsForSex(sex: string | null): SubjectPronounClass[] {
  if (sex === "female") return ["feminine", "neutral"];
  if (sex === "male") return ["masculine", "neutral"];
  return ["feminine", "masculine", "neutral"];
}

function normalizeSex(value: unknown) {
  const sex = normalize(typeof value === "string" ? value : "");
  if (/^(?:female|f)$/.test(sex)) return "female";
  if (/^(?:male|m)$/.test(sex)) return "male";
  return null;
}

function normalizeSpecies(value: string) {
  const species = normalize(value);
  if (species === "kitten") return "cat";
  if (species === "puppy") return "dog";
  return species || null;
}

function resolved(entity: RecentSubjectEntity, candidates: RecentSubjectEntity[]): RecentPronounResolution {
  return { status: "resolved", entity, candidatePetIds: petIds(candidates) };
}

function ambiguous(candidates: RecentSubjectEntity[]): RecentPronounResolution {
  return { status: "ambiguous", entity: null, candidatePetIds: petIds(candidates) };
}

function petIds(entities: RecentSubjectEntity[]) {
  return [...new Set(entities.flatMap((entity) => entity.petId ? [entity.petId] : []))];
}

function entityRecencyScore(entity: RecentSubjectEntity) {
  return Math.max(entity.lastSubjectTurn * 2 + 1, entity.lastMentionTurn * 2);
}

function petKey(id: string) {
  return `pet:${id}`;
}

function containsWholeTerm(value: string, term: string) {
  return (` ${normalize(value)} `).includes(` ${normalize(term)} `);
}

function normalize(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
