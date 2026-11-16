import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Reuse the existing security selection; this is not a replacement for full CI.
const command = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).scripts["test:security"].split(/\s+/);
if (command.shift() !== "node" || command.shift() !== "--test" ||
    !command.length || command.some(file => !/^tests\/[a-z0-9-]+\.test\.mjs$/.test(file))) {
  throw new Error("Review the changed security test command before running it here.");
}
const result = spawnSync(process.execPath, [
  "--import", "./scripts/audits/offline-network-guard.mjs",
  "--import", "./tests/helpers/register-release-typescript.mjs",
  "--test", "--test-concurrency=1", "--test-reporter=tap", ...command,
], {
  env: { ...process.env, FURVISE_AI_ENABLED: "false", FURVISE_AI_MEMORY_EXTRACTION_ENABLED: "false", OPENAI_API_KEY: "" },
  stdio: "inherit",
});
process.exit(result.status ?? 1);
