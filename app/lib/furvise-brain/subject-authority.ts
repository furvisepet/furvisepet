import type { AuthoritativeTurnSubjectResolution } from "../intelligence/entities/resolve-turn-subject.ts";
import type { FurviseSubjectKind, FurviseSubjectSource, FurviseTurnAuthority } from "./turn-authority.ts";

function sourceForResolution(resolution: AuthoritativeTurnSubjectResolution): FurviseSubjectSource {
  if (resolution.requiresClarification || resolution.status === "ambiguous" || resolution.status === "unresolved") return "unresolved";
  if (resolution.explicitSubject) return "explicit";
  return resolution.status === "contextual" ? "conversation" : "selected_pet";
}

function kindForResolution(resolution: AuthoritativeTurnSubjectResolution): FurviseSubjectKind {
  if (resolution.requiresClarification || resolution.status === "ambiguous" || resolution.status === "unresolved") return "unresolved";
  if (resolution.discourseFocus) return resolution.discourseFocus.kind;
  if (resolution.petIds.length > 1) return "multi_pet";
  if (resolution.petIds.length === 1) return "pet";
  return "other";
}

/**
 * Subject resolution is allowed to update only the subject field of the brain
 * turn. It cannot alter intent, memory scope, mutation authority, references or
 * confirmation state.
 */
export function applySubjectResolution(
  turn: FurviseTurnAuthority,
  resolution: AuthoritativeTurnSubjectResolution,
): FurviseTurnAuthority {
  const petIds = [...new Set(resolution.petIds.filter(Boolean))];
  const unresolved = resolution.requiresClarification
    || resolution.status === "ambiguous"
    || resolution.status === "unresolved";

  return Object.freeze({
    ...turn,
    subject: Object.freeze({
      petIds: Object.freeze(unresolved ? [] : petIds),
      kind: kindForResolution(resolution),
      label: resolution.discourseFocus?.label || null,
      source: sourceForResolution(resolution),
      unresolved,
    }),
  });
}
