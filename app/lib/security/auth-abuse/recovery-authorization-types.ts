export type RecoveryAuthorizationState = "ready" | "processing" | "consumed" | "expired" | "invalid";

export interface RecoveryAuthorizationStore {
  issue(input: { key: string; ttlMs: number; userHash: string }): Promise<boolean>;
  inspect(input: { key: string; userHash: string }): Promise<RecoveryAuthorizationState>;
  claim(input: { key: string; operationHash: string; userHash: string }): Promise<"claimed" | RecoveryAuthorizationState>;
  consume(input: { key: string; operationHash: string; userHash: string }): Promise<boolean>;
  release(input: { key: string; operationHash: string; userHash: string }): Promise<boolean>;
}
