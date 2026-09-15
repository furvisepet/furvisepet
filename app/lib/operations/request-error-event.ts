/** Keep framework errors useful without collecting messages, URLs or credentials. */
export function requestErrorEvent(routePath: string, requestId: string, timestamp: string) {
  return {
    eventType: "application_error",
    feature: "app",
    severity: "high",
    errorCode: "UNHANDLED_REQUEST_ERROR",
    // Next supplies a route template, not the actual request URL or query.
    route: routePath.split(/[?#]/)[0].slice(0, 160),
    requestId,
    timestamp,
    metadata: {},
  };
}
