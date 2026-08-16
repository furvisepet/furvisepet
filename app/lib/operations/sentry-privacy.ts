type SentryEventShape = {
  breadcrumbs?: unknown;
  contexts?: unknown;
  exception?: { values?: unknown[] };
  extra?: unknown;
  fingerprint?: unknown;
  logentry?: unknown;
  message?: unknown;
  request?: unknown;
  tags?: unknown;
  user?: unknown;
};

type SentryHintShape = { attachments?: unknown[] };
type SentrySpanShape = { data?: unknown; description?: unknown };

export const SENTRY_DATA_COLLECTION = {
  cookies: false,
  databaseQueryData: false,
  frameContextLines: 0,
  genAI: { inputs: false, outputs: false },
  graphQL: { document: false, variables: false },
  httpBodies: [],
  httpHeaders: { request: false, response: false },
  stackFrameVariables: false,
  urlQueryParams: false,
  userInfo: false,
};

export const SENTRY_PRIVACY_OPTIONS = {
  autoSessionTracking: false,
  beforeBreadcrumb: () => null,
  beforeSend: scrubSentryEvent,
  beforeSendSpan: scrubSentrySpan,
  beforeSendTransaction: scrubSentryEvent,
  dataCollection: SENTRY_DATA_COLLECTION,
  enableLogs: false,
  sendDefaultPii: false,
  tracePropagationTargets: [],
};

export function getSentryTracesSampleRate(nodeEnv: string | undefined) {
  return nodeEnv === "production" ? 0.1 : 1.0;
}

function scrubSentryEvent<T>(event: T, hint?: SentryHintShape): T {
  if (hint?.attachments) hint.attachments = [];
  const input = event as T & SentryEventShape;
  return {
    ...input,
    breadcrumbs: undefined,
    contexts: undefined,
    exception: scrubException(input.exception),
    extra: undefined,
    fingerprint: undefined,
    logentry: undefined,
    message: undefined,
    request: undefined,
    tags: scrubOperationalTags(input.tags),
    user: undefined,
  };
}

const OPERATIONAL_TAG_KEYS = new Set(["errorCode", "eventType", "feature", "operationId", "requestId", "route", "severity"]);

function scrubOperationalTags(tags: unknown) {
  if (!tags || typeof tags !== "object" || Array.isArray(tags)) return undefined;
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(tags)) {
    if (!OPERATIONAL_TAG_KEYS.has(key) || typeof value !== "string") continue;
    const sanitized = value.replace(/[^A-Za-z0-9_./:-]/g, "").slice(0, 160);
    if (sanitized) output[key] = sanitized;
  }
  return Object.keys(output).length ? output : undefined;
}

function scrubException(exception: SentryEventShape["exception"]) {
  if (!exception?.values) return exception;
  return {
    values: exception.values.map((value) => {
      if (!value || typeof value !== "object") return { value: "Unexpected application error" };
      const candidate = value as { stacktrace?: unknown; type?: unknown };
      return {
        stacktrace: scrubStacktrace(candidate.stacktrace),
        type: typeof candidate.type === "string" && /^[A-Za-z_$][\w$.-]{0,119}$/.test(candidate.type) ? candidate.type : "Error",
        value: "Unexpected application error",
      };
    }),
  };
}

function scrubStacktrace(stacktrace: unknown) {
  if (!stacktrace || typeof stacktrace !== "object") return stacktrace;
  const candidate = stacktrace as { frames?: unknown[] };
  if (!candidate.frames) return stacktrace;
  return {
    ...candidate,
    frames: candidate.frames.map((frame) => {
      if (!frame || typeof frame !== "object") return frame;
      const value = frame as { filename?: unknown };
      return {
        ...value,
        context_line: undefined,
        filename: typeof value.filename === "string" ? value.filename.split(/[?#]/, 1)[0].slice(0, 500) : value.filename,
        post_context: undefined,
        pre_context: undefined,
        vars: undefined,
      };
    }),
  };
}

function scrubSentrySpan<T>(span: T): T {
  const input = span as T & SentrySpanShape;
  return { ...input, data: {}, description: undefined };
}
