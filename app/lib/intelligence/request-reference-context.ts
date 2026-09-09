type Turn = { id: string; role: "user" | "furvise"; text: string };
/** Referenced dialogue survives window selection but never enters factual
 * contextRecords. Missing/truncated references are explicitly represented. */
export function requestReferenceContext(turns: readonly Turn[], referenceIds: readonly string[]) {
  const requested = new Set(referenceIds);
  const retained = turns.filter(turn => requested.has(turn.id));
  for (const turn of [...turns].reverse()) {
    if (retained.length >= 8) break;
    if (turn.role === "user" && !retained.some(item => item.id === turn.id)) retained.push(turn);
  }
  const ids = new Set(retained.map(turn => turn.id));
  return {
    purpose: "reference_and_tone_only_not_medical_evidence",
    turns: turns.filter(turn => ids.has(turn.id)).map(turn => ({ id: turn.id, role: turn.role, text: turn.text.slice(0, 700) })),
    missingReferenceIds: referenceIds.filter(id => !ids.has(id)),
    truncatedReferenceIds: retained.filter(turn => requested.has(turn.id) && turn.text.length > 700).map(turn => turn.id),
  };
}
