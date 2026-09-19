export type WorkingMemoryTurn = {
  id: string;
  role: "user" | "furvise";
  text: string;
};

export type WorkingMemoryReference = Readonly<{
  sourceTurnId: string;
  sourceText: string;
}>;

const casualFollowup = /^(?:(?:so|ok(?:ay)?|lol|lmao|haha|and|but)\s+)*(?:what\s+(?:do\s+)?(?:you|u)\s+think(?:\s+about\s+(?:that|it))?|what\s+about\s+(?:that|it)|thoughts?(?:\s+on\s+(?:that|it))?|was\s+(?:that|it)\s+(?:funny|weird|cute|silly|wild|crazy)|how\s+(?:about|was)\s+(?:that|it)|really|why)[?!. ]*$/iu;
const explicitFreshTask = /\b(?:history|records?|care\s+history|timeline|profile|weight|dose|medication|medicine|vet|veterinar|lab|test|diagnos|appointment|when|date|how\s+many|count|compare|save|record|log|add|edit|correct|delete|remove|archive|passed\s+away|died)\b/iu;

/**
 * Resolve only very short conversational reactions to the most recent USER
 * statement. This is working-memory reference resolution, not evidence or
 * persistence authority. Assistant text is intentionally never the source.
 */
export function resolveWorkingMemoryFollowup(
  message: string,
  turns: readonly WorkingMemoryTurn[],
): WorkingMemoryReference | null {
  const current = String(message || "").normalize("NFKC").trim();
  if (!current || current.length > 100 || explicitFreshTask.test(current) || !casualFollowup.test(current)) return null;
  const source = [...turns].reverse().find(turn => turn.role === "user"
    && turn.text.trim().length >= 6
    && !casualFollowup.test(turn.text.trim()));
  if (!source) return null;
  return Object.freeze({ sourceTurnId: source.id, sourceText: source.text });
}
