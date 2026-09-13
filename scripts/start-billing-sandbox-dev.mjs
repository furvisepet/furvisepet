import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

const ENV_FILE = ".env.billing-sandbox.local";

function fail(code) {
  console.error(`FAIL ${code}`);
  process.exitCode = 1;
}

let fileEnv;
try {
  fileEnv = parseEnv(readFileSync(ENV_FILE, "utf8"));
} catch (error) {
  if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
    fail("BILLING_SANDBOX_ENV_FILE_MISSING");
  } else {
    fail("BILLING_SANDBOX_ENV_FILE_INVALID");
  }
}

if (process.exitCode) process.exit();

const childEnv = { ...process.env, ...fileEnv };
if (childEnv.NODE_OPTIONS?.includes("--env-file")) {
  fail("BILLING_SANDBOX_NODE_OPTIONS_ENV_FILE_FORBIDDEN");
  process.exit();
}

const child = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "dev", "--webpack"],
  {
    cwd: process.cwd(),
    env: childEnv,
    stdio: "inherit",
  },
);

child.on("error", () => fail("BILLING_SANDBOX_DEV_START_FAILED"));
child.on("exit", (code, signal) => {
  if (signal) {
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
