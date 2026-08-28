export type TurnstileExecutionState = { lastSignal: number | null };

export function executeTurnstileOnce(input: {
  api: { execute(widgetId: string): void } | undefined;
  signal: number | null;
  state: TurnstileExecutionState;
  widgetId: string | null;
}) {
  if (!input.api || !input.widgetId || input.signal === null || input.state.lastSignal === input.signal) return false;
  input.state.lastSignal = input.signal;
  input.api.execute(input.widgetId);
  return true;
}
