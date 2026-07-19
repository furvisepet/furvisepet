#!/usr/bin/env node

import { performance } from "node:perf_hooks";

const DEFAULT_BASE_URL = "http://127.0.0.1:3000";
const baseUrl = normalizeBaseUrl(process.env.BASE_URL || DEFAULT_BASE_URL);
const totalRequests = parsePositiveInteger(process.env.TOTAL_REQUESTS, 100);
const concurrency = parsePositiveInteger(process.env.CONCURRENCY, 10);
const profileId = (process.env.PROFILE_ID || "").trim();
const allowWrites = process.env.ALLOW_WRITES === "true";
const authToken = (process.env.AUTH_BEARER_TOKEN || "").trim();
const includeProtected = process.env.INCLUDE_PROTECTED === "true";

if (!isLocalBaseUrl(baseUrl) && !process.env.BASE_URL) {
  throw new Error("Non-local targets require an explicit BASE_URL.");
}

if (!isLocalBaseUrl(baseUrl) && process.env.CONFIRM_NON_LOCAL !== "true") {
  throw new Error("Set CONFIRM_NON_LOCAL=true before running against staging.");
}

if (allowWrites && !authToken) {
  throw new Error("ALLOW_WRITES=true requires AUTH_BEARER_TOKEN for a test account.");
}

const readOnlyRoutes = [
  "/",
  "/login",
  "/forgot-password",
  "/privacy",
  "/dashboard",
  "/care-log",
  "/ask",
  ...(profileId ? [`/results?profileId=${encodeURIComponent(profileId)}`] : ["/results"]),
];

const protectedPageRoutes = includeProtected ? ["/account", "/pets"] : [];
const writeRoutes = allowWrites ? [{ method: "POST", path: "/api/account/detect-country" }] : [];
const scenarios = [
  ...readOnlyRoutes.map((path) => ({ method: "GET", path })),
  ...protectedPageRoutes.map((path) => ({ method: "GET", path })),
  ...writeRoutes,
];

const results = [];
let nextIndex = 0;

console.log(
  JSON.stringify(
    {
      allowWrites,
      baseUrl,
      concurrency,
      includeProtected,
      routes: scenarios.map((scenario) => `${scenario.method} ${scenario.path}`),
      totalRequests,
    },
    null,
    2,
  ),
);

const startedAt = performance.now();
await Promise.all(Array.from({ length: concurrency }, runWorker));
const elapsedMs = performance.now() - startedAt;

const durations = results.map((result) => result.durationMs).sort((left, right) => left - right);
const statusCounts = countBy(results, (result) => String(result.status));
const errorCount = results.filter((result) => result.error || result.status >= 500).length;

console.log(
  JSON.stringify(
    {
      completed: results.length,
      elapsedMs: round(elapsedMs),
      errorRate: round(errorCount / Math.max(1, results.length)),
      latencyMs: {
        avg: round(durations.reduce((sum, value) => sum + value, 0) / Math.max(1, durations.length)),
        p50: percentile(durations, 50),
        p95: percentile(durations, 95),
        p99: percentile(durations, 99),
      },
      statusCounts,
    },
    null,
    2,
  ),
);

async function runWorker() {
  while (nextIndex < totalRequests) {
    const requestIndex = nextIndex;
    nextIndex += 1;
    const scenario = scenarios[requestIndex % scenarios.length];
    results.push(await requestScenario(scenario));
  }
}

async function requestScenario({ method, path }) {
  const started = performance.now();
  const headers = {};
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      headers,
      method,
      redirect: "manual",
    });
    await response.arrayBuffer();
    return {
      durationMs: performance.now() - started,
      method,
      path,
      status: response.status,
    };
  } catch (error) {
    return {
      durationMs: performance.now() - started,
      error: error instanceof Error ? error.message : String(error),
      method,
      path,
      status: 0,
    };
  }
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, "");
}

function isLocalBaseUrl(value) {
  try {
    const url = new URL(value);
    return ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

function percentile(sortedValues, pct) {
  if (sortedValues.length === 0) return 0;
  const index = Math.ceil((pct / 100) * sortedValues.length) - 1;
  return round(sortedValues[Math.max(0, Math.min(sortedValues.length - 1, index))]);
}

function countBy(values, getKey) {
  return values.reduce((counts, value) => {
    const key = getKey(value);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function round(value) {
  return Math.round(value * 100) / 100;
}
