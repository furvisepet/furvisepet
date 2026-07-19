import type { OnboardingMode } from "../lib/petwise";
import { normalizeOnboardingMode } from "../lib/petwise";

export type OnboardingModeSnapshot = {
  requestedMode: string | null;
  storedMode: string | null;
  storedProfileId: string | null;
};

export type OnboardingModeDecision = {
  finalMode: OnboardingMode;
  editingProfileId: string;
  savedProfileId: string;
  shouldClearDraftStorage: boolean;
  shouldClearProfileIdStorage: boolean;
  shouldClearMemoriesStorage: boolean;
  shouldClearAnalysisStorage: boolean;
  shouldKeepStoredDraft: boolean;
  shouldLoadExistingProfile: boolean;
  loadExistingProfileId: string;
  shouldRedirectToNewMode: boolean;
};

export function resolveOnboardingModeDecision({
  requestedMode,
  storedMode,
  storedProfileId,
}: OnboardingModeSnapshot): OnboardingModeDecision {
  const hasExplicitRequestedMode = requestedMode !== null && requestedMode !== "";
  const normalizedRequestedMode = hasExplicitRequestedMode
    ? normalizeOnboardingMode(requestedMode)
    : normalizeOnboardingMode(storedMode);
  const normalizedStoredMode = normalizeOnboardingMode(storedMode);
  const hasStoredProfileId = Boolean(storedProfileId);

  if (hasExplicitRequestedMode && normalizedRequestedMode === "new") {
    const shouldClearDraftStorage = normalizedStoredMode !== "new" || hasStoredProfileId;

    return {
      finalMode: "new",
      editingProfileId: "",
      savedProfileId: "",
      shouldClearDraftStorage,
      shouldClearProfileIdStorage: shouldClearDraftStorage,
      shouldClearMemoriesStorage: shouldClearDraftStorage,
      shouldClearAnalysisStorage: shouldClearDraftStorage,
      shouldKeepStoredDraft: !shouldClearDraftStorage && normalizedStoredMode === "new",
      shouldLoadExistingProfile: false,
      loadExistingProfileId: "",
      shouldRedirectToNewMode: false,
    };
  }

  if (normalizedRequestedMode === "edit") {
    if (hasStoredProfileId) {
      return {
        finalMode: "edit",
        editingProfileId: storedProfileId || "",
        savedProfileId: "",
        shouldClearDraftStorage: false,
        shouldClearProfileIdStorage: false,
        shouldClearMemoriesStorage: false,
        shouldClearAnalysisStorage: false,
        shouldKeepStoredDraft: false,
        shouldLoadExistingProfile: true,
        loadExistingProfileId: storedProfileId || "",
        shouldRedirectToNewMode: false,
      };
    }

    return {
      finalMode: "new",
      editingProfileId: "",
      savedProfileId: "",
      shouldClearDraftStorage: true,
      shouldClearProfileIdStorage: true,
      shouldClearMemoriesStorage: true,
      shouldClearAnalysisStorage: true,
      shouldKeepStoredDraft: false,
      shouldLoadExistingProfile: false,
      loadExistingProfileId: "",
      shouldRedirectToNewMode: hasExplicitRequestedMode,
    };
  }

  const shouldKeepStoredDraft = normalizedStoredMode === "new" && !hasStoredProfileId;
  const shouldClearDraftStorage = !shouldKeepStoredDraft && (normalizedStoredMode !== "new" || hasStoredProfileId);

  return {
    finalMode: "new",
    editingProfileId: "",
    savedProfileId: "",
    shouldClearDraftStorage,
    shouldClearProfileIdStorage: shouldClearDraftStorage,
    shouldClearMemoriesStorage: shouldClearDraftStorage,
    shouldClearAnalysisStorage: shouldClearDraftStorage,
    shouldKeepStoredDraft,
    shouldLoadExistingProfile: normalizedStoredMode === "edit" && hasStoredProfileId,
    loadExistingProfileId: normalizedStoredMode === "edit" && hasStoredProfileId ? storedProfileId || "" : "",
    shouldRedirectToNewMode: false,
  };
}

export function getOnboardingSaveProfileId(mode: OnboardingMode, editingProfileId: string) {
  return mode === "edit" ? editingProfileId : "";
}
