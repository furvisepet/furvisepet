export type OptionalContextResult<T> = {
  data: T;
  source: string;
  unavailable: boolean;
  error: unknown | null;
};

export async function recoverOptionalQuery<T>(
  source: string,
  query: PromiseLike<{ data: T | null; error: unknown }>,
  fallback: T,
): Promise<OptionalContextResult<T>> {
  try {
    const result = await query;
    if (result.error) return { data: fallback, source, unavailable: true, error: result.error };
    return { data: result.data ?? fallback, source, unavailable: false, error: null };
  } catch (error) {
    return { data: fallback, source, unavailable: true, error };
  }
}

export async function recoverOptionalValue<T>(
  source: string,
  operation: PromiseLike<T>,
  fallback: T,
): Promise<OptionalContextResult<T>> {
  try {
    return { data: await operation, source, unavailable: false, error: null };
  } catch (error) {
    return { data: fallback, source, unavailable: true, error };
  }
}
