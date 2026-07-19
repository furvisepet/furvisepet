import {
  ANALYSIS_STORAGE_KEY,
  parseStoredAnalysis,
  stampStoredAnalysisResult,
  type StoredAnalysisResult,
} from "./ai-analysis";

export const STORED_GUIDANCE_PROFILE_ID_STORAGE_KEY = "petwise:dog-profile-id";

export type StoredGuidanceSnapshot = {
  profileId: string;
  result: StoredAnalysisResult | null;
};

type BrowserStorageLike = Pick<Storage, "getItem" | "setItem">;

export function readStoredGuidanceSnapshot(
  storage: Pick<Storage, "getItem"> | null = getBrowserStorage(),
): StoredGuidanceSnapshot {
  if (!storage) return { profileId: "", result: null };

  try {
    const raw = storage.getItem(ANALYSIS_STORAGE_KEY);
    return {
      profileId: storage.getItem(STORED_GUIDANCE_PROFILE_ID_STORAGE_KEY) || "",
      result: raw ? parseStoredAnalysis(JSON.parse(raw)) : null,
    };
  } catch {
    return { profileId: "", result: null };
  }
}

export function writeStoredGuidanceResult(
  result: StoredAnalysisResult,
  storage: BrowserStorageLike | null = getBrowserStorage(),
) {
  if (!storage) return;
  storage.setItem(ANALYSIS_STORAGE_KEY, JSON.stringify(stampStoredAnalysisResult(result)));
}

function getBrowserStorage() {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}
