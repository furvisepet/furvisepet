export type ThemeMode = "light" | "dark";

export type Appearance = {
  mode: ThemeMode;
};

export const DEFAULT_THEME_MODE: ThemeMode = "dark";
export const THEME_MODE_STORAGE_KEY = "furvise-appearance-mode";
export const APPEARANCE_MODE_COOKIE = "furvise-mode";
export const LEGACY_THEME_MODE_STORAGE_KEY = "petwise-theme-mode";
const LEGACY_THEME_STORAGE_KEY = "petwise-theme";
const LEGACY_BACKGROUND_COOKIE = "furvise-background";

export const MODE_OPTIONS = [
  { label: "Light", name: "light" },
  { label: "Dark", name: "dark" },
] as const;

export function normalizeThemeMode(value: string | null): ThemeMode {
  if (value === "light" || value === "dark") return value;
  return DEFAULT_THEME_MODE;
}

export function getDefaultAppearance(): Appearance {
  return {
    mode: DEFAULT_THEME_MODE,
  };
}

export function serializeAppearanceCookie(mode: ThemeMode) {
  const cookieOptions = "Path=/; Max-Age=31536000; SameSite=Lax";
  return [`${APPEARANCE_MODE_COOKIE}=${mode}; ${cookieOptions}`];
}

export function readAppearanceFromCookieValues(modeValue: string | undefined) {
  return {
    mode: normalizeThemeMode(modeValue ?? null),
  };
}

export function syncAppearanceToDocument(mode: ThemeMode) {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.dataset.theme = mode;
  document.documentElement.style.colorScheme = mode;
  document.body.dataset.theme = mode;
  document.documentElement.removeAttribute("data-pet-background");
  document.body.removeAttribute("data-pet-background");
}

export function writeAppearanceCookies(mode: ThemeMode) {
  if (typeof document === "undefined") {
    return;
  }

  for (const cookie of serializeAppearanceCookie(mode)) {
    document.cookie = cookie;
  }

  document.cookie = `${LEGACY_BACKGROUND_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function readStoredAppearance() {
  if (typeof window === "undefined") {
    return getDefaultAppearance();
  }

  try {
    const storedMode = window.localStorage.getItem(THEME_MODE_STORAGE_KEY);
    const legacyMode = window.localStorage.getItem(LEGACY_THEME_MODE_STORAGE_KEY);
    const mode = normalizeThemeMode(storedMode === "light" || storedMode === "dark" ? storedMode : legacyMode);
    window.localStorage.setItem(THEME_MODE_STORAGE_KEY, mode);
    window.localStorage.removeItem(LEGACY_THEME_MODE_STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
    window.localStorage.removeItem("petwise-background");

    return {
      mode,
    };
  } catch {
    return getDefaultAppearance();
  }
}
