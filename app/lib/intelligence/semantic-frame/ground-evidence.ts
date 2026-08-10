import type { GroundedSemanticEvidence, ProposedSemanticEvidence, ProposedSemanticFrame, SemanticEvidence } from "./types.ts";

export type EvidenceGroundingFailureReason = "EVIDENCE_EMPTY_SURFACE" | "EVIDENCE_NOT_FOUND" | "EVIDENCE_AMBIGUOUS";
export type EvidenceGroundingFailure = {
  ownerType: "mention" | "claim";
  ownerId: string;
  evidenceIndex: number;
  reason: EvidenceGroundingFailureReason;
};
export type EvidenceGroundingResult = {
  frame: ProposedSemanticFrame;
  totalEvidence: number;
  groundedEvidence: number;
  exactEvidence: number;
  normalizedEvidence: number;
  failures: EvidenceGroundingFailure[];
};

type Candidate = GroundedSemanticEvidence;
type AlignmentResult = { grounded: Array<GroundedSemanticEvidence | null>; failures: Array<{ evidenceIndex: number; reason: EvidenceGroundingFailureReason }> };

/**
 * Converts model-provided extractive surfaces into canonical source offsets.
 * No fuzzy or semantic matching occurs here: an exact or safely normalized,
 * uniquely located substring is required.
 */
export function groundSemanticFrameEvidence(frame: ProposedSemanticFrame, sourceMessage: string): EvidenceGroundingResult {
  const copy = structuredClone(frame);
  const failures: EvidenceGroundingFailure[] = [];
  let totalEvidence = 0;
  let groundedEvidence = 0;
  let exactEvidence = 0;
  let normalizedEvidence = 0;

  const groundOwner = (ownerType: "mention" | "claim", ownerId: string, evidence: SemanticEvidence[]) => {
    totalEvidence += evidence.length;
    const result = alignEvidenceFragments(evidence.map((item) => ({ surfaceText: item.surfaceText })), sourceMessage);
    for (const failure of result.failures) failures.push({ ownerType, ownerId, ...failure });
    for (const item of result.grounded) {
      if (!item) continue;
      groundedEvidence += 1;
      if (item.alignment === "exact") exactEvidence += 1;
      else normalizedEvidence += 1;
    }
    return result.grounded.map((item, index) => item || evidence[index]);
  };

  for (const mention of copy.mentions) mention.evidence = groundOwner("mention", mention.localId, mention.evidence);
  for (const claim of copy.claims) claim.evidence = groundOwner("claim", claim.localId, claim.evidence);
  return { frame: copy, totalEvidence, groundedEvidence, exactEvidence, normalizedEvidence, failures };
}

export function alignEvidenceFragments(evidence: ProposedSemanticEvidence[], source: string): AlignmentResult {
  const grounded: Array<GroundedSemanticEvidence | null> = Array(evidence.length).fill(null);
  const failures: AlignmentResult["failures"] = [];
  const groups = new Map<string, number[]>();

  evidence.forEach((item, index) => {
    const key = foldForAlignment(item.surfaceText).text;
    if (!key) {
      failures.push({ evidenceIndex: index, reason: "EVIDENCE_EMPTY_SURFACE" });
      return;
    }
    groups.set(key, [...(groups.get(key) || []), index]);
  });

  for (const indexes of groups.values()) {
    const surfaceText = evidence[indexes[0]].surfaceText;
    const candidates = evidenceCandidates(source, surfaceText);
    if (!candidates.length) {
      for (const evidenceIndex of indexes) failures.push({ evidenceIndex, reason: "EVIDENCE_NOT_FOUND" });
      continue;
    }
    if (candidates.length === 1 && indexes.length === 1) {
      grounded[indexes[0]] = candidates[0];
      continue;
    }
    if (candidates.length === indexes.length) {
      indexes.forEach((evidenceIndex, position) => { grounded[evidenceIndex] = candidates[position]; });
      continue;
    }
    for (const evidenceIndex of indexes) failures.push({ evidenceIndex, reason: "EVIDENCE_AMBIGUOUS" });
  }
  return { grounded, failures };
}

function evidenceCandidates(source: string, surfaceText: string): Candidate[] {
  const exact = findExactCandidates(source, surfaceText);
  if (exact.length) return exact;
  const foldedSource = foldForAlignment(source);
  const foldedSurface = foldForAlignment(surfaceText).text;
  if (!foldedSurface || !safeNormalizedSurface(surfaceText, foldedSurface)) return [];
  return findOccurrences(foldedSource.text, foldedSurface)
    .filter((start) => tokenBoundary(foldedSource.text, start, foldedSurface.length))
    .map((start) => ({
      surfaceText,
      start: foldedSource.starts[start],
      end: foldedSource.ends[start + foldedSurface.length - 1],
      quote: source.slice(foldedSource.starts[start], foldedSource.ends[start + foldedSurface.length - 1]),
      alignment: "normalized" as const,
    }))
    .filter(uniqueRange);
}

function findExactCandidates(source: string, surfaceText: string): Candidate[] {
  return findOccurrences(source, surfaceText)
    .filter((start) => sourceBoundary(source, start, surfaceText.length))
    .map((start) => ({ surfaceText, start, end: start + surfaceText.length, quote: source.slice(start, start + surfaceText.length), alignment: "exact" as const }));
}

function findOccurrences(source: string, part: string) {
  const results: number[] = [];
  let from = 0;
  while (part && from <= source.length - part.length) {
    const index = source.indexOf(part, from);
    if (index < 0) break;
    results.push(index);
    from = index + Math.max(1, part.length);
  }
  return results;
}

function sourceBoundary(source: string, start: number, length: number) {
  const first = source[start];
  const last = source[start + length - 1];
  const before = source[start - 1];
  const after = source[start + length];
  return (!isWord(first) || !isWord(before)) && (!isWord(last) || !isWord(after));
}

function tokenBoundary(source: string, start: number, length: number) {
  return (start === 0 || source[start - 1] === " ") && (start + length === source.length || source[start + length] === " ");
}

function isWord(value: string | undefined) {
  return Boolean(value && /[\p{L}\p{N}]/u.test(value));
}

function safeNormalizedSurface(surfaceText: string, foldedSurface: string) {
  if (foldedSurface.replace(/\s/g, "").length < 2) return false;
  return !/[^\p{L}\p{N}\p{M}\s.,;:!?"'’‘`´\-\u2010-\u2015()[\]{}\/\\]/u.test(surfaceText);
}

function foldForAlignment(value: string) {
  const text: string[] = [];
  const starts: number[] = [];
  const ends: number[] = [];
  const segmenter = new Intl.Segmenter("und", { granularity: "grapheme" });
  for (const segment of segmenter.segment(value)) {
    const folded = segment.segment.normalize("NFKC").toLocaleLowerCase("en");
    for (const character of folded) {
      if (/[\p{L}\p{N}]/u.test(character)) {
        text.push(character); starts.push(segment.index); ends.push(segment.index + segment.segment.length);
      } else if (text.length && text[text.length - 1] !== " ") {
        text.push(" "); starts.push(segment.index); ends.push(segment.index + segment.segment.length);
      }
    }
  }
  while (text[text.length - 1] === " ") { text.pop(); starts.pop(); ends.pop(); }
  return { text: text.join(""), starts, ends };
}

function uniqueRange(candidate: Candidate, index: number, items: Candidate[]) {
  return items.findIndex((item) => item.start === candidate.start && item.end === candidate.end) === index;
}
