// Run the complete discovered suite; propagate the same offline loader to nested audits.
import { spawnSync } from "node:child_process";
const imports = ["../scripts/audits/offline-network-guard.mjs", "../tests/helpers/register-release-typescript.mjs"]
  .map(path => "--import=" + new URL(path, import.meta.url).href);
const env = {
  ...process.env,
  NODE_OPTIONS: [process.env.NODE_OPTIONS || "", "--max-old-space-size=2048", ...imports].join(" ").trim(),
  OPENAI_API_KEY: "",
  FURVISE_AI_ENABLED: "false",
  FURVISE_AI_ASK_ENABLED: "false",
  FURVISE_AI_MEMORY_EXTRACTION_ENABLED: "false",
};
const result = spawnSync(process.execPath, [
  "--test", "--test-concurrency=4", "--test-timeout=180000", "--test-reporter=tap",
], { env, stdio: "inherit" });
if (result.error) console.error(result.error);
if (result.signal) console.error("Full test runner terminated by signal:", result.signal);
process.exit(result.status ?? 1);
