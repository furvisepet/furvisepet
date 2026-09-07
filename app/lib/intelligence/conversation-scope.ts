import type { FurviseLiveContext } from "./types.ts";

/** Drop saved pet facts for a server-validated, read-only conversation scope.
 * The selected pet remains only the conversation/storage container.
 * Current-message safety checks continue on the original user text. */
export function scopeConversationContext(context: FurviseLiveContext): FurviseLiveContext {
  if (!context.askInterpretation?.conversationOnly) return context;
  return {
    ...context, eligiblePets: [], owner: { ...context.owner, profile: null },
    careEntries: [], selectedCareEntries: [], activeConcerns: [], recentlyResolvedConcerns: [],
    activeEpisodes: [], monitoringEpisodes: [], recentlyResolvedEpisodes: [],
    currentState: null, legacyPetMemories: [], memories: [], productFeedback: [],
    askHistory: undefined, episodeResult: undefined, episodePresentation: undefined,
    historyFallback: undefined, evidenceLoading: undefined,
    contextRecovery: { unavailableSources: [] },
    conversationTurns: context.conversationTurns.filter(turn => turn.role === "user"),
  };
}
