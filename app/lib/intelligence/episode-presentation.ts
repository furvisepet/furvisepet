export type EpisodePresentation = { source: "unverified_assistant_presentation"; messageId: string; petId: string; prompt: string; items: string[] };
type Message = { id: string; role: string; user_text: string | null; response_data: Record<string, unknown> | null };
/** Navigation context only. Never establishes episode membership or medical facts. */
export function episodePresentation(messages: Message[], allowedIds: Set<string>, pet: {id:string;name:string}, pets: Array<{id:string;name:string}>): EpisodePresentation | undefined {
  const chronological = [...messages].reverse();
  const index = chronological.findLastIndex(m => m.role === "furvise");
  const message = chronological[index], previous = chronological[index - 1];
  if (!message || !previous || previous.role !== "user" || !allowedIds.has(message.id) || !allowedIds.has(previous.id)) return;
  const prompt = previous.user_text;
  if (typeof prompt !== "string" || prompt.length > 400 || !/\bepisodes?\b/i.test(prompt)) return;
  const named = (name: string) => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(prompt);
  if (!pet.name || !named(pet.name) || pets.some(p => p.id !== pet.id && p.name && named(p.name))) return;
  const sections = message.response_data?.sections;
  if (!Array.isArray(sections)) return;
  const lists = sections.filter(s => s && typeof s === "object" && typeof s.heading === "string" && /^(?:supported )?episodes$/i.test(s.heading));
  if (lists.length !== 1 || !Array.isArray(lists[0].items)) return;
  const items: unknown[] = lists[0].items;
  if (!items.length || items.length > 8 || items.some(i => typeof i !== "string" || !i.trim() || i.length > 240)) return;
  return {source:"unverified_assistant_presentation", messageId:message.id, petId:pet.id, prompt, items:items as string[]};
}
