import { AsyncLocalStorage } from "node:async_hooks";
import type { AiOperationAdmission } from "./admission.ts";

const admissionContext = new AsyncLocalStorage<AiOperationAdmission>();

export function getActiveAiAdmission() { return admissionContext.getStore() || null; }

export function runWithAiAdmission<T>(admission: AiOperationAdmission, action: () => Promise<T>) {
  return admissionContext.run(admission, action);
}

export function recordActiveAiUserCreditState(state: "completed" | "limit_reached" | "released" | "reserved" | "reused") {
  admissionContext.getStore()?.recordUserCreditState(state);
}
