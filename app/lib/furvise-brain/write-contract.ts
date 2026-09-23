import { isDeepStrictEqual } from "node:util";
import type { FurviseApplicationAction } from "../application-actions/types.ts";

/** This adapter covers care-history capability writes. It does not grant
 * authorization or reinterpret language; the existing action gate does that. */
const operations = {
  "care_history.add": "append",
  "care_history.edit": "replace",
  "care_history.remove": "delete",
} as const;

export function careWriteOperation(kind: FurviseApplicationAction["kind"]) {
  return operations[kind as keyof typeof operations] ?? null;
}

export type FurviseWriteReceipt = Readonly<{
  operation: "append" | "replace" | "delete";
  operationId: string;
  petId: string;
  sourceMessageId: string;
  status: "succeeded" | "failed" | "cancelled";
}>;

/** A transport response is not durable proof. The caller must reload the
 * capability with the same authenticated owner, assistant message and id.
 * Missing/read-failed receipts leave the result unconfirmed; retry uses the
 * original capability so the database can replay without another mutation. */
export function confirmFurviseWriteReceipt(input: {
  operationId: string;
  authorized: FurviseApplicationAction;
  returned: FurviseApplicationAction;
  persistedStatus: string | null;
  persistedReceipt: FurviseApplicationAction | null;
}): FurviseWriteReceipt {
  const operation = careWriteOperation(input.authorized.kind);
  const receipt = input.persistedReceipt;
  if (!operation || !receipt || !["succeeded", "failed", "cancelled"].includes(input.persistedStatus || "")
    || receipt.status !== input.persistedStatus
    || receipt.id !== input.operationId
    || receipt.kind !== input.authorized.kind
    || receipt.petId !== input.authorized.petId
    || !input.authorized.sourceMessageId
    || receipt.sourceMessageId !== input.authorized.sourceMessageId
    || !isDeepStrictEqual(receipt.appendJob, input.authorized.appendJob)
    || !isDeepStrictEqual(receipt.replaceJob, input.authorized.replaceJob)
    || !isDeepStrictEqual(receipt.input, input.authorized.input)
    || !isDeepStrictEqual(receipt, input.returned)) {
    throw new Error("FURVISE_WRITE_RECEIPT_UNCONFIRMED");
  }
  return Object.freeze({ operation, operationId: input.operationId, petId: receipt.petId,
    sourceMessageId: receipt.sourceMessageId!, status: receipt.status as FurviseWriteReceipt["status"] });
}
