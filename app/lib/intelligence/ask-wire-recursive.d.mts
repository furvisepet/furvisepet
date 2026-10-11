import type { AskWirePlan } from "./ask-wire-policy.mjs";
type Check = () => void;
export const RECURSIVE_TRANSPORT_LIMITS: Readonly<{
  maxDepth: number; maxContainers: number; maxValues: number;
  maxContainerEntries: number; maxStringUnits: number; maxSerializedCharacters: number;
}>;
export type RecursiveAskWirePlan = {
  schema: Record<string, unknown>;
  instructions: string;
  encode(value: unknown, checkRuntime: Check): unknown;
  decode(value: unknown, checkRuntime: Check): { request: unknown };
};
export function createRecursiveAskWirePlan(plan: AskWirePlan, checkCompilation: Check): RecursiveAskWirePlan;
export function createRecursiveProviderTransport(codec: {
  schema: Record<string, unknown>; rootSchema: Record<string, unknown>;
  decode(value: unknown): unknown;
}, checkCompilation?: Check, lowerLimits?: Partial<typeof RECURSIVE_TRANSPORT_LIMITS>): {
  schema: Record<string, unknown>;
  limits: typeof RECURSIVE_TRANSPORT_LIMITS;
  fromGraph(value: unknown, checkRuntime: Check): unknown;
  toGraph(value: unknown, checkRuntime: Check): unknown;
  decode(value: unknown, checkRuntime: Check): unknown;
};

/** Indexed provider transport with identical bounded decode contract. */
export type IndexedAskWirePlan = RecursiveAskWirePlan;
export function createIndexedAskWirePlan(plan: AskWirePlan, checkCompilation: Check): IndexedAskWirePlan;
