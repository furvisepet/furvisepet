/** Shared outer limits. Stage deadlines and provider admission remain bounded;
 * the browser and concurrency lease must outlive server settlement. */
export const ASK_OPERATION_TIMEOUT_MS = 120_000;
export const ASK_CLIENT_TIMEOUT_MS = ASK_OPERATION_TIMEOUT_MS + 5_000;
export const ASK_CONCURRENCY_TTL_MS = ASK_OPERATION_TIMEOUT_MS + 15_000;

/** The composer and API must reject oversized input before reserving a turn. */
export const ASK_MAX_QUESTION_CHARACTERS = 1200;
