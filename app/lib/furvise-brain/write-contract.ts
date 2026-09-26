import { isDeepStrictEqual } from "node:util";
import type { FurviseApplicationAction } from "../application-actions/types.ts";

/** Every mutation kind that may cross the canonical Ask capability executor.
 * This adapter never grants authority. It only confirms the immutable terminal
 * receipt persisted by Heart after the existing action gate authorizes it. */
const operations = {
  "care_history.add": "append",
  "care_history.edit": "replace",
  "care_history.remove": "remove",
  "care_state.resolve": "state_transition",
  "care_state.reopen": "state_transition",
  "pet.update_profile": "profile",
  "memory.set_preference": "preference",
  "memory.forget_preference": "preference",
  "pet.mark_deceased": "lifecycle",
  "pet.mark_active": "lifecycle",
  "pet.archive": "lifecycle",
  "pet.delete_permanently": "remove",
} as const;

export type FurviseWriteOperation = typeof operations[keyof typeof operations];

export function canonicalWriteOperation(kind: FurviseApplicationAction["kind"]): FurviseWriteOperation | null {
  return operations[kind as keyof typeof operations] ?? null;
}

export type FurviseWriteReceipt = Readonly<{
  operation: FurviseWriteOperation;
  operationId: string;
  petId: string;
  sourceMessageId: string;
  status: "succeeded" | "failed" | "cancelled";
}>;

/** A transport response is not durable proof. The caller must reload the
 * capability with the same authenticated owner, assistant message and id.
 * Missing/read-failed receipts leave the result unconfirmed; retry uses the
 * original capability so the database can replay without another mutation.
 *
 * Receipt authority is operation-agnostic: every immutable field of the
 * persisted receipt must equal the server-rebound action that was authorized.
 * Only transport identity and terminal presentation fields may differ. */
export function confirmFurviseWriteReceipt(input: {
  operationId: string;
  authorized: FurviseApplicationAction;
  returned: FurviseApplicationAction;
  persistedStatus: string | null;
  persistedReceipt: FurviseApplicationAction | null;
}): FurviseWriteReceipt {
  const operation = canonicalWriteOperation(input.authorized.kind);
  const receipt = input.persistedReceipt;
  if (!operation || !receipt || !["succeeded", "failed", "cancelled"].includes(input.persistedStatus || "")
    || receipt.status !== input.persistedStatus
    || receipt.id !== input.operationId
    || receipt.kind !== input.authorized.kind
    || receipt.petId !== input.authorized.petId
    || !input.authorized.sourceMessageId
    || receipt.sourceMessageId !== input.authorized.sourceMessageId
    || !isDeepStrictEqual(immutableAction(receipt), immutableAction(input.authorized))
    || !isDeepStrictEqual(receipt, input.returned)) {
    throw new Error("FURVISE_WRITE_RECEIPT_UNCONFIRMED");
  }
  return Object.freeze({ operation, operationId: input.operationId, petId: receipt.petId,
    sourceMessageId: receipt.sourceMessageId!, status: receipt.status as FurviseWriteReceipt["status"] });
}

function immutableAction(action: FurviseApplicationAction) {
  const { id, status, resultMessage, errorMessage, ...authority } = action;
  void id; void status; void resultMessage; void errorMessage;
  return authority;
}
