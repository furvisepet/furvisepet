/** Shared lexical forms, not mutation authority. Subject, certainty and event
 * ordering remain the responsibility of the source-grounded recovery decision. */
const vomiting = String.raw`(?:vomit(?:ed|ing|s)?|(?:throw|throws|threw|thrown|throwing)\s+up)`;
export const vomitingSymptomPattern = new RegExp(`\\b${vomiting}\\b`, 'i');
const symptoms: Array<{ target: RegExp; activity?: string; topic?: string }> = [
  { target: /vomit|stomach|nausea/, activity: vomiting, topic: String.raw`nausea|stomach upset|vomit\w*` },
  { target: /hid|hiding|withdraw/, activity: 'hid|hide|hides|hiding', topic: String.raw`withdraw\w*` },
  { target: /breath|respirat/, activity: 'breathing (?:hard|fast|deeply)', topic: String.raw`breath\w*|respirat\w*` },
  { target: /letharg|energy|tired/, topic: String.raw`energy|letharg\w*|tired|weak` },
  { target: /diarr|stool/, activity: 'diarrhea', topic: String.raw`diarr\w*|loose stools?|stools?` },
  { target: /limp|mobility/, activity: 'limp(?:ed|ing|s)?', topic: String.raw`limp\w*|mobility` },
  { target: /bleed/, activity: 'bleed(?:ing|s)?|bled', topic: String.raw`bleed\w*` },
  { target: /cough/, activity: 'cough(?:ed|ing|s)?', topic: String.raw`cough\w*` },
  { target: /itch|scratch/, activity: 'itch(?:ed|ing|es)?|scratch(?:ed|ing|es)?', topic: String.raw`itch\w*|scratch\w*` },
  { target: /pain|sore/, topic: String.raw`pain\w*|sore|tender` },
];

export const concernAliases: Array<[RegExp, RegExp]> = symptoms.map(({ target, activity, topic }) =>
  [target, new RegExp(`\\b(?:${[activity, topic].filter(Boolean).join('|')})\\b`, 'i')]);
export const symptomActivitySource = symptoms.map(({ activity }) => activity).filter(Boolean).join('|');

/** A negated symptom mention is not affirmative activity. Match the governing
 * predicate prefix, not arbitrary "not" elsewhere (e.g. "not sure"). */
export function hasAffirmativeSymptom(text: string, inheritedNegation = false) {
  if (inheritedNegation) return false;
  const mentions = new RegExp(`\\b(?:${symptomActivitySource})\\b`, 'gi');
  return [...text.matchAll(mentions)].some((match) => {
    const prefix = text.slice(0, match.index);
    return !/\b(?:(?:not|never|no)(?:\s+(?:been|be|have|had|has|still|ever|actually|really|recently|also|any|more|further))*|\w+n['’]t(?:\s+(?:been|be|have|ever|really|recently))*)\s*$/i.test(prefix);
  });
}
