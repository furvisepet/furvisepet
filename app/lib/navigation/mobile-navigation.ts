export type MobileNavigationState = "compact" | "expanded";
export type MobileNavigationTab = "ask" | "history" | "more" | "pets" | "today";

export const MOBILE_NAVIGATION_SCROLL_THRESHOLD_PX = 14;
export const MOBILE_NAVIGATION_IDLE_EXPAND_MS = 300;

export const NAVIGATION_ICON_ASSETS = {
  ask: "/images/nav-ask-v1.webp",
  history: "/images/nav-history-v1.webp",
  more: "/images/nav-more-v1.webp",
  pets: "/images/nav-pets-v1.webp",
  products: "/images/nav-products-v1.webp",
  today: "/images/nav-today-v1.webp",
} as const;

export const MOBILE_NAVIGATION_ITEMS = [
  { asset: NAVIGATION_ICON_ASSETS.today, href: "/today", label: "Today", matches: ["/today", "/dashboard"], tab: "today" },
  { asset: NAVIGATION_ICON_ASSETS.history, href: "/history", label: "History", matches: ["/history", "/care-log"], tab: "history" },
  { asset: NAVIGATION_ICON_ASSETS.ask, href: "/ask", label: "Ask", matches: ["/ask"], tab: "ask" },
  { asset: NAVIGATION_ICON_ASSETS.pets, href: "/pets", label: "Pets", matches: ["/pets", "/dogs"], tab: "pets" },
  { asset: NAVIGATION_ICON_ASSETS.more, href: "/account", label: "Account", matches: ["/account"], tab: "more" },
] as const;

const MORE_ROUTE_PREFIXES = ["/account", "/privacy", "/settings", "/shop", "/terms", "/vet-brief", "/vet-briefs"] as const;
const AUTHENTICATED_APP_NAVIGATION_PREFIXES = [
  "/account",
  "/ask",
  "/care-log",
  "/dashboard",
  "/dogs",
  "/history",
  "/pets",
  "/products",
  "/results",
  "/settings",
  "/shop",
  "/today",
  "/vet-brief",
  "/vet-briefs",
] as const;

function matchesRoute(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function getActiveMobileNavigationTab(pathname: string): MobileNavigationTab | null {
  const item = MOBILE_NAVIGATION_ITEMS.find((candidate) => candidate.matches.some((route) => matchesRoute(pathname, route)));
  if (item) return item.tab;
  return MORE_ROUTE_PREFIXES.some((route) => matchesRoute(pathname, route)) ? "more" : null;
}

export function isAuthenticatedAppNavigationRoute(pathname: string) {
  return AUTHENTICATED_APP_NAVIGATION_PREFIXES.some((route) => matchesRoute(pathname, route));
}

export function shouldShowMobileNavigation(pathname: string, authenticated: boolean) {
  return authenticated && isAuthenticatedAppNavigationRoute(pathname);
}

export function resolveMobileNavigationState({
  accumulatedDelta,
  currentState,
  reducedMotion,
  scrollY,
}: {
  accumulatedDelta: number;
  currentState: MobileNavigationState;
  reducedMotion: boolean;
  scrollY: number;
}): MobileNavigationState {
  if (reducedMotion || scrollY <= MOBILE_NAVIGATION_SCROLL_THRESHOLD_PX) return "expanded";
  if (accumulatedDelta >= MOBILE_NAVIGATION_SCROLL_THRESHOLD_PX) return "compact";
  if (accumulatedDelta <= -MOBILE_NAVIGATION_SCROLL_THRESHOLD_PX) return "expanded";
  return currentState;
}
