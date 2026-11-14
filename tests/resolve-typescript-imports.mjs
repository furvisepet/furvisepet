/**
 * Node's native TypeScript stripping does not resolve extensionless TS imports.
 * Keep the production Next.js module graph untouched and resolve only relative
 * extensionless .ts specifiers for direct Node test execution.
 */
export async function resolve(specifier, context, nextResolve) {
  // Only the server-only marker needs React's server export condition.
  // Applying react-server globally breaks react-dom/server rendering tests.
  if (specifier === "server-only") {
    return nextResolve(specifier, {
      ...context,
      conditions: [...new Set([...context.conditions, "react-server"])],
    });
  }
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (
      !["ERR_MODULE_NOT_FOUND", "ERR_UNSUPPORTED_DIR_IMPORT"].includes(error?.code) ||
      !/^\.\.?\//.test(specifier) ||
      /\.[a-z0-9]+$/i.test(specifier)
    ) {
      throw error;
    }
    // Native Node test execution: emulate only common Next.js relative TS and
    // directory-index resolution, never resolve an unrelated package.
    for (const candidate of [specifier + ".ts", specifier + "/index.ts"]) {
      try {
        return await nextResolve(candidate, context);
      } catch (candidateError) {
        if (!["ERR_MODULE_NOT_FOUND", "ERR_UNSUPPORTED_DIR_IMPORT"].includes(candidateError?.code))
          throw candidateError;
      }
    }
    throw error;
  }
}