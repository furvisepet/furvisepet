// Next accepts extensionless TypeScript imports; Node's test runner does not.
// This test-only loader keeps that resolution consistent on Windows and Linux.
import { registerHooks, createRequire } from "node:module";
import { readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
const ts = createRequire(import.meta.url)("typescript");
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "server-only") return { url: "release-test:server-only", shortCircuit: true };
    try { return next(specifier, context); }
    catch (error) {
      if (!["ERR_MODULE_NOT_FOUND", "ERR_UNSUPPORTED_DIR_IMPORT"].includes(error.code) || !specifier.startsWith(".")) throw error;
      for (const suffix of [".ts", ".tsx", ".mjs", "/index.ts"]) {
        const url = new URL(specifier + suffix, context.parentURL);
        if (existsSync(fileURLToPath(url)) && statSync(fileURLToPath(url)).isFile()) return next(url.href, context);
      }
      throw error;
    }
  },
  load(url, context, next) {
    if (url === "release-test:server-only") return { format: "module", source: "export {};", shortCircuit: true };
    if (url.startsWith("file:") && /\.tsx?$/.test(url)) {
      const source = ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
        fileName: fileURLToPath(url),
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
      }).outputText;
      return { format: "module", source, shortCircuit: true };
    }
    return next(url, context);
  },
});
