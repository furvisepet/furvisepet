// Test-process loader only: application builds retain the real server-only boundary.
import { registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const marker = Symbol.for("furvise.test.bootstrap");
if (!globalThis[marker]) {
  globalThis[marker] = true;
  registerHooks({
    load(url, context, next) {
      // Test-only: avoid Node's experimental WebAssembly TS transform.
      // Production never imports this bootstrap or its server-only alias.
      if (url.startsWith("file:") && /[.]tsx?$/.test(new URL(url).pathname)
        && !url.includes("/node_modules/")) {
        const filename = fileURLToPath(url);
        const result = ts.transpileModule(readFileSync(filename, "utf8"), {
          fileName: filename, reportDiagnostics: true,
          compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
            jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, isolatedModules: true },
        });
        const errors = result.diagnostics?.filter(item => item.category === ts.DiagnosticCategory.Error) || [];
        if (errors.length) throw new SyntaxError(errors.map(item =>
          ts.flattenDiagnosticMessageText(item.messageText, " ")).join("; "));
        return { format: "module", source: result.outputText, shortCircuit: true };
      }
      return next(url, context);
    },
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
if (!options.includes(ownImport)) process.env.NODE_OPTIONS = `${options} ${ownImport}`.trim();
