export function isObservationalAssessmentQuestion(message: string) {
  const normalized = message.trim();
  return /^(?:is|are|does|do|how (?:can|do|should)|what should)\b/i.test(normalized)
    && /\b(?:tell|check|look for|putting|holding|breathing|dehydrat|swelling|weight on|pain|rate)\b/i.test(normalized);
}

export function isUselessQuestionEcho(question: string, answer: string, petName: string) {
  if (!isObservationalAssessmentQuestion(question) || !answer.trim().endsWith("?")) return false;
  const left = comparisonTokens(question, petName);
  const right = comparisonTokens(answer, petName);
  if (!left.length || !right.length) return false;
  const overlap = left.filter((token) => right.includes(token)).length;
  return overlap / Math.min(left.length, right.length) >= 0.8 && Math.abs(left.length - right.length) <= 4;
}

export function buildObservationAssessmentFallback(question: string, petName: string) {
  const pet = cleanPetName(petName);
  if (/\b(?:limp|leg|paw|putting|holding|weight on)\b/i.test(question)) {
    return `I can't see ${pet} directly, so watch ${pet} take a few steps on a non-slip surface without forcing the leg. Putting some weight down means the paw touches and supports part of the step; holding it up means avoiding contact. If ${pet} will not bear weight, seems very painful, has swelling, bleeding, or an obvious wound, contact a veterinarian promptly.`;
  }
  if (/\bdehydrat|\b(?:gums?|skin tent)\b/i.test(question)) {
    return `I can't confirm dehydration remotely. Check whether ${pet}'s gums feel moist rather than dry or tacky, and note drinking, urination, vomiting, diarrhea, and energy. If ${pet} cannot keep water down, seems weak, or has very dry gums, contact a veterinarian promptly.`;
  }
  if (/\b(?:breath(?:e|ing)?|respirat\w*|rate)\b/i.test(question)) {
    return `Count ${pet}'s breaths while fully resting or asleep: one rise and fall of the chest is one breath. Count for 30 seconds and double it. Open-mouth breathing, obvious effort, blue or pale gums, collapse, or an inability to settle needs emergency veterinary care now.`;
  }
  if (/\bswell|swollen\b/i.test(question)) {
    return `Compare the area with the other side in the same light, look for a change in outline, warmth, redness, or tenderness, and take a photo for comparison without pressing hard. Rapidly increasing swelling, severe pain, facial swelling, or breathing trouble needs prompt veterinary care.`;
  }
  return `I can't observe ${pet} directly, but you can check safely by watching the sign at rest, comparing it with ${pet}'s usual baseline, and avoiding anything that causes pain or distress. Describe exactly what you see and when it happens so the difference can be interpreted rather than guessed.`;
}

function comparisonTokens(value: string, petName: string) {
  const ignored = new Set(["a", "an", "the", "is", "are", "does", "do", "it", "she", "he", "they", "her", "his", "their", cleanPetName(petName).toLowerCase()]);
  return [...new Set(value.toLowerCase().match(/[a-z0-9]+/g) || [])].filter((token) => !ignored.has(token));
}

function cleanPetName(value: string) {
  return value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "the pet";
}
