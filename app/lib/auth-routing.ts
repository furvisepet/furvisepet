export const NEW_PET_ONBOARDING_PATH = "/onboarding?mode=new";
export const NEW_PET_LOGIN_PATH = `/login?next=${encodeURIComponent(NEW_PET_ONBOARDING_PATH)}`;

const LOCAL_ORIGIN = "https://furvise.local";

export function buildLoginHref(nextPath = NEW_PET_ONBOARDING_PATH) {
  return `/login?next=${encodeURIComponent(nextPath)}`;
}

export function getSafeNextPath(value: string | null | undefined, fallback = "/dashboard") {
  const candidate = value?.trim() || "";

  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//") || candidate.startsWith("/\\")) {
    return fallback;
  }

  try {
    const parsed = new URL(candidate, LOCAL_ORIGIN);
    if (parsed.origin !== LOCAL_ORIGIN) {
      return fallback;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function pointsToNewPetOnboarding(path: string) {
  const safePath = getSafeNextPath(path, "");
  if (!safePath) return false;

  const parsed = new URL(safePath, LOCAL_ORIGIN);
  return parsed.pathname === "/onboarding" && parsed.searchParams.get("mode") === "new";
}
