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
      error?.code !== "ERR_MODULE_NOT_FOUND" ||
      !/^\.\.?\//.test(specifier) ||
      /\.[a-z0-9]+$/i.test(specifier)
    ) {
      throw error;
    }
    return nextResolve(specifier + ".ts", context);
  }
}