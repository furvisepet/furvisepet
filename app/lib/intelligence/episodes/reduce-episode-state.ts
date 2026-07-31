import type { EpisodeEvent, EpisodeStatus } from "./types.ts";

export function reduceEpisodeState(current: EpisodeStatus, event: EpisodeEvent): EpisodeStatus {
  if (event.action === "resolve_concern" || /returned to normal|normal again|finished|completed/i.test(`${event.title || ""} ${event.note}`)) return "resolved";
  if (event.action === "reopen_concern") return "active";
  return current === "resolved" ? "resolved" : current;
}
