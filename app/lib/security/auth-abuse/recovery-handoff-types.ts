export interface RecoveryHandoffStore {
  consume(input: { key: string }): Promise<boolean>;
  issue(input: { key: string; ttlMs: number }): Promise<boolean>;
}
