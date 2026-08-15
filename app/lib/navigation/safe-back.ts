export function canUseSameSiteNavigationHistory({
  currentOrigin,
  currentPathname,
  historyLength,
  referrer,
}: {
  currentOrigin: string;
  currentPathname: string;
  historyLength: number;
  referrer: string;
}) {
  if (historyLength <= 1 || !referrer) return false;
  try {
    const previous = new URL(referrer);
    return previous.origin === currentOrigin && previous.pathname !== currentPathname;
  } catch {
    return false;
  }
}
