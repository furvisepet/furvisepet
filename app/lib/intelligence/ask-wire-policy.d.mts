export type AskWirePlan = {
  schema: Record<string, unknown>;
  rootSchema: Record<string, unknown>;
  instructions: string;
  encode(value: unknown): unknown;
  decode(value: unknown): { request: unknown };
};
/** Restores a proposal's JSON structure; Binder remains the semantic authority. */
export function createAskWirePlan(
  canonicalSchema: Record<string, unknown>,
  sourceInstructions: string,
  sourceAuthority?: { inputAuthority: string; dialogueAuthority: string },
  checkBudget?: () => void
): AskWirePlan;
