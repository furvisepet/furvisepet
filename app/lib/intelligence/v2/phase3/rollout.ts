export type AskV2Phase3Mode = "off" | "shadow_read" | "low_risk_dual_write";

export function resolveAskV2Phase3Mode(input: {
  configuredMode?: string;
  tenantAllowlist?: string;
  verifiedUserId: string;
}): AskV2Phase3Mode {
  const configured = parseMode(input.configuredMode);
  if (configured !== "low_risk_dual_write") return configured;
  const allowed = new Set((input.tenantAllowlist || "").split(",").map((value) => value.trim()).filter(Boolean));
  return allowed.has("*") || allowed.has(input.verifiedUserId) ? "low_risk_dual_write" : "shadow_read";
}

function parseMode(value?: string): AskV2Phase3Mode {
  return value === "shadow_read" || value === "low_risk_dual_write" ? value : "off";
}
