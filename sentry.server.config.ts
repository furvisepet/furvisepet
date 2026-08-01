import * as Sentry from "@sentry/nextjs";
import { SENTRY_PRIVACY_OPTIONS, getSentryTracesSampleRate } from "./app/lib/operations/sentry-privacy";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();
if (dsn) {
  Sentry.init({
    ...SENTRY_PRIVACY_OPTIONS,
    dsn,
    includeLocalVariables: false,
    tracesSampleRate: getSentryTracesSampleRate(process.env.NODE_ENV),
  });
}
