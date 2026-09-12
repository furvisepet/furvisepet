import { currentSafetyClauses } from '../ai/safety-temporal-scope.ts';
import { detectAskConcernTags, detectImmediateAskEmergency } from '../ask-safety-context.ts';
export type VetBriefUrgency = 'urgent' | 'emergency';
export function vetBriefUrgency(message: string): VetBriefUrgency | null {
  if (detectImmediateAskEmergency(message)) return 'emergency';
  const current = currentSafetyClauses(message).filter(clause => !clause.isNegated).map(clause => clause.text).join(' ');
  const tags = detectAskConcernTags(current);
  if (tags.includes('breathing_difficulty')) return 'emergency';
  return tags.length ? 'urgent' : null;
}
export function vetBriefUrgencyText(level: VetBriefUrgency) {
  return level === 'emergency'
    ? 'Contact an emergency veterinarian now about the symptoms reported for this appointment. Do not wait for this brief. Keep handling and exertion to a minimum and follow the clinic’s instructions.'
    : 'Contact your veterinarian promptly about the symptoms reported for this appointment. Do not delay care while preparing this brief.';
}
