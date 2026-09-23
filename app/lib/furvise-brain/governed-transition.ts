import { bindUserSourceSpan, type UserSourceSpan } from "./append-job.ts";
import type { IntelligenceConversationTurn } from "../intelligence/types.ts";

/** A transition's evidence is provenance, never a downstream language parser. */
export type GovernedTransition<Domain extends string, State extends string> = Readonly<{
  domain: Domain; fromState: State; toState: State; authorization: UserSourceSpan;
}>;
export function bindTransitionAuthorization(source: IntelligenceConversationTurn | undefined, quote: unknown): UserSourceSpan {
  if (!source || source.role !== "user" || source.recoveredReceiptReference)
    throw Error("ASK_REQUEST_INVALID:transition_source");
  return bindUserSourceSpan(source, quote);
}
