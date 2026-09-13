import "server-only";

import { validateCareEntryDraft } from "./care-log.mjs";
import { API_BODY_LIMITS, RequestBoundaryError, hasOnlyKeys, isUuid, readBoundedJson } from "./security/request";
import type { CareEntryInput } from "./supabase";

const INPUT_KEYS = ["petProfileId", "category", "title", "note", "severity", "occurredAt"] as const;

export async function parseCareRequest(request: Request, allowDedupe = false): Promise<
  | { response: Response }
  | { dedupe: boolean; input: CareEntryInput }
> {
  let raw: unknown;
  try { raw = await readBoundedJson(request, API_BODY_LIMITS.standard); }
  catch (error) {
    const tooLarge = error instanceof RequestBoundaryError && error.code === "PAYLOAD_TOO_LARGE";
    return { response: Response.json({ error: tooLarge ? "That care update is too large." : "Send a valid care update." }, { status: tooLarge ? 413 : 400 }) };
  }
  if (!hasOnlyKeys(raw, allowDedupe ? ["input", "dedupe"] : ["input"])) return { response: Response.json({ error: "The care update contains unsupported fields." }, { status: 400 }) };
  const body = raw as { input?: unknown; dedupe?: unknown };
  if (!hasOnlyKeys(body.input, INPUT_KEYS)) return { response: Response.json({ error: "The care update contains unsupported fields." }, { status: 400 }) };
  const validation = validateCareEntryDraft(body.input);
  if (!validation.valid || !isUuid(validation.draft.petProfileId) || validation.draft.title.length > 200 || validation.draft.note.length > 4_000) {
    return { response: Response.json({ error: "Review the care update fields and try again." }, { status: 400 }) };
  }
  return { dedupe: body.dedupe === true, input: validation.draft as CareEntryInput };
}
