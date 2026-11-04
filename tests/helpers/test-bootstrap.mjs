// Test-process loader only: application builds retain the real server-only boundary.
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const marker = Symbol.for("furvise.test.bootstrap");
if (!globalThis[marker]) {
  globalThis[marker] = true;
  registerHooks({
    resolve(specifier, context, next) {
      if (specifier === "server-only") {
        return { url: "data:text/javascript,export {};", format: "module", shortCircuit: true };
      }
      if (specifier.startsWith(".") && context.parentURL?.startsWith("file:") && !context.parentURL.includes("/node_modules/")) {
        const url = new URL(specifier, context.parentURL);
        for (const suffix of [".ts", ".tsx", "/index.ts", "/index.tsx", "/index.js"]) {
          const candidate = new URL(url.href + suffix);
          if (existsSync(fileURLToPath(candidate))) return next(candidate.href, context);
        }
      }
      return next(specifier, context);
    },
  });
}
const ownImport = `--import=${import.meta.url}`;
const options = process.env.NODE_OPTIONS || "";
if (!options.includes(ownImport)) process.env.NODE_OPTIONS = `${options} --experimental-transform-types ${ownImport}`.trim();
