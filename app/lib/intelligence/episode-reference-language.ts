/** Surface wording only; never episode or pet authority. Both subject
 * continuity and episode lookup use this grammar to avoid divergent routing. */
export function parseEpisodeFollowUp(message: string): { ordinal: string; ambiguous: boolean } | null {
  const match = /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|last|that)\s+(?:(?:vomiting|soft[- ]stool|stool|diarrhea|breathing)\s+)?(?:one|episode)\b/i.exec(message);
  if (!match) return null;
  const ordinals = message.match(/\b(?:first|second|third|fourth|fifth|sixth|seventh|eighth|last)\b/gi) || [];
  const demonstratives = message.match(/\bthat\s+(?:(?:vomiting|soft[- ]stool|stool|diarrhea|breathing)\s+)?(?:one|episode)\b/gi) || [];
  return { ordinal: match[1].toLowerCase(), ambiguous: ordinals.length + demonstratives.length !== 1 };
}
export function isEpisodeSubjectReference(message: string) {
  // Preserve existing subject-only continuity for these unbound locators.
  // They do not thereby acquire a resolvable displayed ordinal.
  return parseEpisodeFollowUp(message) !== null || /\b(?:previous|this)\s+(?:one|episode)\b/i.test(message);
}
