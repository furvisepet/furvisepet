import type { FurviseLiveContext, IntelligenceSafetyLevel } from "./types.ts";
import { resolveSafetyState } from "./safety-state.ts";

export type ProductSafety = {
  level: IntelligenceSafetyLevel;
  shoppingSuppressed: boolean;
  reasonCode: "CURRENT_REQUEST_EMERGENCY" | "CURRENT_URGENT_STATE" | "ACTIVE_URGENT_EPISODE" | "ACTIVE_URGENT_CONCERN" | "MONITORING" | "RECENTLY_RESOLVED" | "ROUTINE";
  sourceEpisodeIds: string[];
  sourceConcernIds: string[];
  stateVersion: number;
};

export function resolveProductSafety(context: FurviseLiveContext): ProductSafety {
  const shared = resolveSafetyState(context);
  const urgentEpisodes = context.activeEpisodes.filter((episode) => episode.episode_type === "symptom" && episode.severity === "urgent");
  const urgentConcerns = context.activeConcerns.filter((concern) => concern.severity === "urgent");
  const stateOverall = context.currentState?.state.wellbeing?.overall;
  const level: IntelligenceSafetyLevel = shared.level === "emergency" ? "emergency"
    : shared.level === "urgent" || urgentEpisodes.length || urgentConcerns.length ? "urgent"
      : shared.level === "routine" && (stateOverall === "monitoring" || stateOverall === "concerning") ? "monitor" : shared.level;
  const shoppingSuppressed = level === "urgent" || level === "emergency";
  const reasonCode: ProductSafety["reasonCode"] = level === "emergency" ? "CURRENT_REQUEST_EMERGENCY"
    : urgentEpisodes.length ? "ACTIVE_URGENT_EPISODE"
      : urgentConcerns.length ? "ACTIVE_URGENT_CONCERN"
        : level === "urgent" ? "CURRENT_URGENT_STATE"
          : level === "monitor" ? "MONITORING"
            : level === "recently_resolved" ? "RECENTLY_RESOLVED" : "ROUTINE";
  return { level, shoppingSuppressed, reasonCode,
    sourceEpisodeIds: urgentEpisodes.map((episode) => episode.id),
    sourceConcernIds: urgentConcerns.map((concern) => concern.id),
    stateVersion: context.currentState?.state_version || 0 };
}
