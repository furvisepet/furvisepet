/**
 * Executive-control evidence for a natural-language owner-note write.
 *
 * This function answers one narrow question: did the current USER message
 * itself contain an affirmative persistence directive? It does not decide
 * whether the content is clinically useful, which pet is the subject, or
 * whether a model proposed a save.
 *
 * Transport-level note mode and confirmed application capabilities are separate
 * authorization channels and do not pass through this parser.
 */
export function isExplicitOwnerNoteMutationAuthorization(message: string): boolean {
  const text = message.trim().replace(/\s+/gu, " ");
  if (!text || text.length > 1600) return false;

  // Refusals, hypotheticals and questions about persistence are never write
  // authority even when they contain a save verb.
  if (declinesPersistence(text)
    || /\b(?:hypothetical|fictional|pretend|suppose|example|translate|translation)\b/iu.test(text)
    || /^(?:did|do|does|have|has|had|was|were|is|are|when|where|why|how|what)\b[^?]{0,80}\b(?:save|saved|log|logged|record|recorded|add|added|store|stored)\b/iu.test(text)) {
    return false;
  }
  if (/\b(?:save|log|record|add|store)\b[\s\S]{0,100}\b(?:only if|unless)\b/iu.test(text)) return false;

  return englishAuthorization(text)
    || spanishAuthorization(text)
    || frenchAuthorization(text)
    || germanAuthorization(text)
    || arabicAuthorization(text)
    || japaneseAuthorization(text);
}

export function retainedOwnerNoteAuthorization(input: {
  authorizationMessageId: string;
  request?: { id: string; role: string; text: string } | null;
}): boolean {
  return Boolean(input.request
    && input.request.role === "user"
    && input.request.id === input.authorizationMessageId
    && isExplicitOwnerNoteMutationAuthorization(input.request.text));
}

function englishAuthorization(text: string) {
  if (/^(?:(?:please|also)\s+|i\s+(?:just\s+)?want\s+(?:you\s+)?to\s+|(?:can|could|would|will)\s+you\s+)?(?:save|log|record|add|store)\b/iu.test(text)) return true;
  if (/^(?:(?:please|also)\s+)?put\b[\s\S]{0,100}\b(?:note|notes|history|record|records|timeline|care log)\b/iu.test(text)) return true;
  if (/^(?:(?:please|also)\s+)?keep\b[\s\S]{0,100}\b(?:as|in)\b[\s\S]{0,40}\b(?:note|notes|history|record|records|timeline|care log)\b/iu.test(text)) return true;
  return false;
}

function spanishAuthorization(text: string) {
  return /^(?:(?:por favor|también|tambien)\s+)?(?:guarda(?:lo|la)?|guárda(?:lo|la)?|registr(?:a|alo|ála)|anota|añade|agrega)\b/iu.test(text)
    || /^(?:puedes|podrías|podrias)\s+(?:guardar|registrar|anotar|añadir|agregar)\b/iu.test(text);
}

function frenchAuthorization(text: string) {
  return /^(?:(?:s['’]il te plaît|s['’]il vous plaît|merci de)\s+)?(?:sauvegarde|enregistre|note|ajoute|consigne)\b/iu.test(text)
    || /^(?:peux-tu|pouvez-vous)\s+(?:sauvegarder|enregistrer|noter|ajouter|consigner)\b/iu.test(text);
}

function germanAuthorization(text: string) {
  return /^(?:(?:bitte)\s+)?(?:speicher(?:e)?|protokollier(?:e)?|notier(?:e)?|füg(?:e)?\s+.+\s+hinzu)\b/iu.test(text)
    || /^(?:kannst du|können sie)\s+(?:speichern|protokollieren|notieren|hinzufügen)\b/iu.test(text);
}

function arabicAuthorization(text: string) {
  return /^(?:(?:من فضلك|لو سمحت)\s+)?(?:احفظ|سجل|سجّل|دوّن|دون|أضف)\b/u.test(text)
    || /^(?:هل يمكنك|ممكن)\s+(?:حفظ|تسجيل|تدوين|إضافة)\b/u.test(text);
}

function japaneseAuthorization(text: string) {
  return /(?:保存|記録|メモ|履歴)(?:に|へ|として)?(?:残して|追加して|入れて|保存して|記録して|ください|して下さい)/u.test(text)
    || /(?:これ|それ|この内容|その内容).*(?:保存|記録|メモして)/u.test(text)
    || /記録に残して/u.test(text);
}

function declinesPersistence(text: string) {
  return /\b(?:(?:do\s+not|don['’]?t|dont|never)\s+(?:save|store|record|log|remember|add|change|update)|(?:save|store|record|log)\s+nothing|without\s+(?:saving|storing|recording|logging|changing|updating))\b/iu.test(text)
    || /\bno\s+(?:guardes?|registres?|almacenes?|anotes?|añadas?|agregues?)\b/iu.test(text)
    || /\bne\s+(?:sauvegarde|enregistre|stocke|note|ajoute)\w*\s+(?:rien|pas)\b/iu.test(text)
    || /(?:保存|記録|メモ).*(?:しないで|しない|不要)/u.test(text)
    || /(?:لا|لات)\s*(?:تحفظ|تسجل|تسجّل|تدوّن|تضيف)/u.test(text);
}
