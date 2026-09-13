#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { Redis } from "@upstash/redis";

const EMERGENCY_KEY = "furvise:ai:v1:emergency";
const [command, ...args] = process.argv.slice(2);
const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

if (!url || !token) exitWith("Upstash operator credentials are not configured.", 2);
if (!command || !["status", "disable", "enable"].includes(command)) {
  exitWith("Usage: node scripts/ai-emergency-control.mjs status | disable --reason <text> | enable --confirm-enable", 2);
}

const redis = new Redis({ retry: { retries: 0 }, signal: () => AbortSignal.timeout(2_000), url, token });

try {
  if (command === "status") {
    const state = await redis.get(EMERGENCY_KEY);
    const disabled = state && typeof state === "object" && state.disabled === true;
    console.log(JSON.stringify({ disabled, updatedAt: readString(state, "updatedAt"), reason: disabled ? readString(state, "reason") : null }));
  } else if (command === "disable") {
    const reason = readArgument(args, "--reason");
    if (!reason || reason.length > 240) exitWith("Disable requires --reason with 1 to 240 characters.", 2);
    const state = { actionId: randomUUID(), disabled: true, reason, updatedAt: new Date().toISOString() };
    await redis.set(EMERGENCY_KEY, state);
    console.log(JSON.stringify({ disabled: true, updatedAt: state.updatedAt, actionId: state.actionId }));
  } else {
    if (!args.includes("--confirm-enable")) exitWith("Enable requires the explicit --confirm-enable flag.", 2);
    const state = { actionId: randomUUID(), disabled: false, reason: "operator_reenabled", updatedAt: new Date().toISOString() };
    await redis.set(EMERGENCY_KEY, state);
    console.log(JSON.stringify({ disabled: false, updatedAt: state.updatedAt, actionId: state.actionId }));
  }
} catch {
  exitWith("The AI emergency state could not be read or changed.", 1);
}

function readArgument(values, name) {
  const index = values.indexOf(name);
  return index >= 0 && typeof values[index + 1] === "string" ? values[index + 1].trim() : "";
}

function readString(value, key) {
  return value && typeof value === "object" && typeof value[key] === "string" ? value[key] : null;
}

function exitWith(message, code) {
  console.error(message);
  process.exit(code);
}
