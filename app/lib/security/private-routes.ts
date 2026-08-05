const PRIVATE_ROUTE_PREFIXES = [
  "/account",
  "/ask",
  "/care-log",
  "/dashboard",
  "/dogs",
  "/history",
  "/onboarding",
  "/pets",
  "/products",
  "/results",
  "/shop",
  "/settings",
  "/today",
  "/vet-brief",
  "/vet-briefs",
] as const;

export const PRIVATE_CACHE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
  Expires: "0",
  Pragma: "no-cache",
} as const;

export function isPrivateRoute(pathname: string) {
  return PRIVATE_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function buildPrivateLoginPath(pathname: string, search = "") {
  const nextPath = `${pathname}${search}`;
  return `/login?next=${encodeURIComponent(nextPath)}`;
}

export function applyPrivateCacheHeaders(headers: Headers) {
  Object.entries(PRIVATE_CACHE_HEADERS).forEach(([name, value]) => headers.set(name, value));
}
