export function isAiEnabled(env: Record<string, string | undefined> = process.env) {
  return env.FURVISE_AI_ENABLED !== "false";
}

export function isAskEnabled(env: Record<string, string | undefined> = process.env) {
  return isAiEnabled(env) && env.FURVISE_AI_ASK_ENABLED !== "false";
}
