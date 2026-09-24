import { createHash } from "node:crypto";

export type StoredReadDomain = "memory" | "current_state" | "operation_receipt";
export type StoredReadReference = {
  ref: string; ownerId: string; capabilityId: string; sourceMessageId: string; assistantMessageId: string;
  petId: string; actionKind: string; createdAt: string; payloadDigest: string;
};
export type StoredRead = {
  operation: "read"; domain: StoredReadDomain; ownerId: string;
  scope: "owner" | "subjects"; subjectIds: string[];
  reference: StoredReadReference | null; projection: "records";
};
export const storedReadDigest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function storedReadSchema(references: readonly StoredReadReference[] = []) {
  return { anyOf: [{ type: "null" }, { type: "object", additionalProperties: false,
    required: ["operation", "domain", "scope", "reference", "projection"], properties: {
      operation: { type: "string", enum: ["read"] },
      domain: { type: "string", enum: ["memory", "current_state", "operation_receipt"] },
      scope: { type: "string", enum: ["owner", "subjects"] },
      reference: { type: ["string", "null"], enum: [null, ...references.map(r => r.ref)] },
      projection: { type: "string", enum: ["records"] },
    } }] };
}
/** Shape/ownership/reference binding only. No linguistic selectors or fallback subject. */
export function bindStoredRead(value: unknown, input: {
  ownerId: string; subjectIds: string[]; references: readonly StoredReadReference[];
}): StoredRead {
  const fail = (): never => { throw Error("ASK_REQUEST_INVALID:stored_read"); };
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail();
  const p = value as Record<string, unknown>;
  if (Object.keys(p).sort().join() !== "domain,operation,projection,reference,scope"
    || p.operation !== "read" || !["memory", "current_state", "operation_receipt"].includes(String(p.domain))
    || !["owner", "subjects"].includes(String(p.scope)) || p.projection !== "records"
    || !input.ownerId || new Set(input.subjectIds).size !== input.subjectIds.length
    || (p.scope === "owner" ? input.subjectIds.length !== 0 : input.subjectIds.length === 0)
    || p.reference !== null && typeof p.reference !== "string") return fail();
  const candidates = input.references.filter(r => r.ref === p.reference && r.ownerId === input.ownerId);
  const reference = p.reference === null ? null : candidates.length === 1 ? candidates[0] : fail();
  // Receipt ownership survives deletion of its former subject. Only owner scope
  // with an exact owned capability can address such a retained receipt.
  if (p.domain === "operation_receipt") {
    if (reference && p.scope === "subjects" && !input.subjectIds.includes(reference.petId)) return fail();
  } else if (reference || p.domain === "current_state" && p.scope !== "subjects") return fail();
  return { operation: "read", domain: p.domain as StoredReadDomain, ownerId: input.ownerId,
    scope: p.scope as StoredRead["scope"], subjectIds: [...input.subjectIds],
    reference: reference ? structuredClone(reference) : null, projection: "records" };
}
