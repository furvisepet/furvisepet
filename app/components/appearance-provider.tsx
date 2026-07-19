"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import AppearanceModal from "./appearance-modal";
import {
  getDefaultAppearance,
  LEGACY_THEME_MODE_STORAGE_KEY,
  THEME_MODE_STORAGE_KEY,
  ThemeMode,
  readStoredAppearance,
  syncAppearanceToDocument,
  writeAppearanceCookies,
} from "../lib/appearance";

type AppearanceDraft = {
  mode: ThemeMode;
};

type AppearanceContextValue = {
  appearance: AppearanceDraft;
  closeAppearance: () => void;
  openAppearance: () => void;
  previewAppearance: (nextAppearance: AppearanceDraft) => void;
  resetAppearance: () => void;
  saveAppearance: (nextAppearance: AppearanceDraft) => void;
  mode: ThemeMode;
  isAppearanceOpen: boolean;
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);
export function AppearanceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [savedAppearance, setSavedAppearance] = useState<AppearanceDraft>(() => {
    if (typeof window === "undefined") {
      return getDefaultAppearance();
    }

    return readStoredAppearance();
  });
  const [draftAppearance, setDraftAppearance] = useState<AppearanceDraft>(savedAppearance);
  const [isAppearanceOpen, setIsAppearanceOpen] = useState(false);

  useEffect(() => {
    syncAppearanceToDocument(isAppearanceOpen ? draftAppearance.mode : savedAppearance.mode);
  }, [draftAppearance, isAppearanceOpen, savedAppearance]);

  const previewAppearance = useCallback((nextAppearance: AppearanceDraft) => {
    setDraftAppearance(nextAppearance);
  }, []);

  const openAppearance = useCallback(() => {
    setDraftAppearance(savedAppearance);
    setIsAppearanceOpen(true);
  }, [savedAppearance]);

  const closeAppearance = useCallback(() => {
    setDraftAppearance(savedAppearance);
    setIsAppearanceOpen(false);
  }, [savedAppearance]);

  const resetAppearance = useCallback(() => {
    setDraftAppearance(getDefaultAppearance());
  }, []);

  const saveAppearance = useCallback((nextAppearance: AppearanceDraft) => {
    try {
      window.localStorage.setItem(THEME_MODE_STORAGE_KEY, nextAppearance.mode);
      window.localStorage.removeItem(LEGACY_THEME_MODE_STORAGE_KEY);
      window.localStorage.removeItem("petwise-theme");
      window.localStorage.removeItem("petwise-background");
    } catch {
      // The selected theme still applies for this page even if storage is blocked.
    }
    syncAppearanceToDocument(nextAppearance.mode);
    writeAppearanceCookies(nextAppearance.mode);
    setSavedAppearance(nextAppearance);
    setDraftAppearance(nextAppearance);
    setIsAppearanceOpen(false);
  }, []);

  const value = useMemo<AppearanceContextValue>(
    () => ({
      appearance: isAppearanceOpen ? draftAppearance : savedAppearance,
      closeAppearance,
      isAppearanceOpen,
      mode: (isAppearanceOpen ? draftAppearance : savedAppearance).mode,
      openAppearance,
      previewAppearance,
      resetAppearance,
      saveAppearance,
    }),
    [
      closeAppearance,
      draftAppearance,
      isAppearanceOpen,
      openAppearance,
      previewAppearance,
      resetAppearance,
      saveAppearance,
      savedAppearance,
    ],
  );

  return (
    <AppearanceContext.Provider value={value}>
      {children}
      <AppearanceModal />
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  const context = useContext(AppearanceContext);
  if (!context) {
    throw new Error("useAppearance must be used inside AppearanceProvider.");
  }
  return context;
}
