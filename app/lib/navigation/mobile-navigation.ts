export type MobileNavigationState = "compact" | "expanded";
export type MobileNavigationTab = "ask" | "history" | "more" | "pets" | "today";

export const MOBILE_NAVIGATION_SCROLL_THRESHOLD_PX = 14;
export const MOBILE_NAVIGATION_IDLE_EXPAND_MS = 300;

export const MOBILE_NAVIGATION_ITEMS = [
  { asset: "/images/today_house.png", href: "/today", label: "Today", matches: ["/today", "/dashboard"], tab: "today" },
  { asset: "/images/history_clock.png", href: "/history", label: "History", matches: ["/history", "/care-log"], tab: "history" },
  { asset: "/images/ask_chat.png", href: "/ask", label: "Ask", matches: ["/ask"], tab: "ask" },
  { asset: "/images/pets_paw.png", href: "/pets", label: "Pets", matches: ["/pets", "/dogs"], tab: "pets" },
] as const;

const MORE_ROUTE_PREFIXES = ["/account", "/privacy", "/shop", "/terms", "/vet-brief", "/vet-briefs"] as const;
const HIDDEN_ROUTE_PREFIXES = ["/auth", "/login", "/signup"] as const;

function matchesRoute(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function getActiveMobileNavigationTab(pathname: string): MobileNavigationTab | null {
  const item = MOBILE_NAVIGATION_ITEMS.find((candidate) => candidate.matches.some((route) => matchesRoute(pathname, route)));
  if (item) return item.tab;
  return MORE_ROUTE_PREFIXES.some((route) => matchesRoute(pathname, route)) ? "more" : null;
}

export function shouldShowMobileNavigation(pathname: string, authenticated: boolean) {
  if (!authenticated || pathname === "/") return false;
  return !HIDDEN_ROUTE_PREFIXES.some((route) => matchesRoute(pathname, route));
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
