import { registerHooks } from "node:module";
registerHooks({ resolve(specifier, context, next) {
 return specifier === "server-only" ? { url:"data:text/javascript,export {};",format:"module",shortCircuit:true } : next(specifier,context);
} });
globalThis.fetch=async()=>{throw Error("OFFLINE_GATE");};
await import("./append-items-authority.test.mjs");
