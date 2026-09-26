import { registerHooks } from "node:module";
registerHooks({ resolve(specifier, context, next) {
  return specifier === "server-only"
    ? { url: "data:text/javascript,export {};", format: "module", shortCircuit: true }
    : next(specifier, context);
} });
globalThis.fetch = async () => { throw Error("V1_WRITE_GATE_NETWORK_FORBIDDEN"); };
await import("./profile-mutation-job.test.mjs");
