import type { StoredAnalysisResult } from "./ai-analysis";
import { formatCareNotePreview, isSevereSymptomCareEntry } from "./care-log.mjs";
import { buildProfileCompleteness, getProfileActionFields } from "./profile-completeness";
import { formatPetDisplayName } from "./petwise";
import type { CareEntryWithPetName, DogProfileWithMemories } from "./supabase";

export type DashboardActivityItem = {
  created_at: string;
  id: string;
  label: string;
  petName: string;
  title: string;
};

export type DashboardNextStepItem = {
  actionHref?: string;
  actionLabel?: string;
  description: string;
  petName: string;
  title: string;
};

export function getPetCareLogHref(profileId: string) {
  return `/care-log?pet=${profileId}`;
}

export function buildDashboardCareEntries(
  entries: CareEntryWithPetName[],
  petNameById = new Map<string, string>(),
) {
  return [...entries]
    .sort(compareNewestFirst)
    .slice(0, 5)
    .map((entry) => ({
      ...entry,
      pet_name: formatPetDisplayName(petNameById.get(entry.pet_profile_id) || entry.pet_name || ""),
      note_preview: formatCareNotePreview(entry.note),
    }));
}

export function buildRecentActivity(
  profiles: DogProfileWithMemories[],
  careEntries: CareEntryWithPetName[] = [],
) {
  return profiles
    .flatMap((profile) => {
      const displayName = formatPetDisplayName(profile.name);
      const items: DashboardActivityItem[] = [
        {
          created_at: profile.created_at,
          id: `profile-created-${profile.id}`,
          label: "Profile",
          petName: displayName,
          title: `Profile created for ${displayName}`,
        },
      ];

      profile.dog_memories.forEach((memory) => {
        items.push({
          created_at: memory.created_at,
          id: `memory-${memory.id}`,
          label: "Memory",
          petName: displayName,
          title: `Memory saved: ${truncateText(memory.text, 72)}`,
        });
      });

      (profile.dog_product_feedback || []).forEach((feedback) => {
        items.push({
          created_at: feedback.created_at,
          id: `feedback-${feedback.id}`,
          label: "Feedback",
          petName: displayName,
          title: `Feedback saved: ${feedback.product_name} (${formatFeedbackType(feedback.feedback_type)})`,
        });
      });

      return items;
    })
    .concat(
      careEntries.map((entry) => {
        const actedAt = entry.updated_at !== entry.created_at ? entry.updated_at : entry.created_at;
        const action = entry.updated_at !== entry.created_at ? "edited" : "added";
        const displayName = formatPetDisplayName(entry.pet_name || "");
        return {
          created_at: actedAt,
          id: `care-${entry.id}-${action}`,
          label: "Care update",
          petName: displayName,
          title: `Care update ${action} for ${displayName}`,
        };
      }),
    )
    .sort(compareNewestFirst);
}

export function buildNextSteps(
  profiles: DogProfileWithMemories[],
  careEntries: CareEntryWithPetName[],
  analysisResult: StoredAnalysisResult | null,
  analysisProfileId: string,
) {
  const steps: DashboardNextStepItem[] = [];
  const careEntriesByPetId = new Set(careEntries.map((entry) => entry.pet_profile_id));

  profiles.forEach((profile) => {
    const profileEntries = careEntries.filter((entry) => entry.pet_profile_id === profile.id);
    const severeSymptom = profileEntries.find((entry) => isSevereSymptomCareEntry(entry));
    const completeness = buildProfileCompleteness(profile);
    const profileActionFields = getProfileActionFields(completeness);
    const displayName = formatPetDisplayName(profile.name);

    if (
      analysisResult?.status === "available" &&
      analysisProfileId === profile.id &&
      analysisResult.analysis.vetAttention.needed &&
      analysisResult.analysis.vetAttention.urgency === "urgent"
    ) {
      steps.push({
        actionHref: `/care-log?pet=${profile.id}`,
        actionLabel: "Open care history",
        description:
          analysisResult.analysis.vetAttention.reason ||
          "Urgent stored guidance should come before routine care.",
        petName: displayName,
        title: `Contact a veterinarian for ${displayName}`,
      });
      return;
    }

    if (severeSymptom) {
      steps.push({
        actionHref: `/care-log?pet=${profile.id}&entry=${severeSymptom.id}`,
        actionLabel: "View severe update",
        description:
          "Furvise does not diagnose. Severe symptoms should be reviewed with a veterinarian.",
        petName: displayName,
        title: `Contact a veterinarian for ${displayName}`,
      });
      return;
    }

    if (profileActionFields.length > 0) {
      steps.push({
        actionHref: `/dogs/${profile.id}/edit`,
        actionLabel: "Finish profile",
        description: `Add ${formatList(profileActionFields)} when you are ready so Furvise has richer context.`,
        petName: displayName,
        title: `Finish ${displayName}'s profile.`,
      });
      return;
    }

    if (
      analysisResult?.status === "available" &&
      analysisProfileId === profile.id &&
      analysisResult.analysis.missingInformation.length > 0
    ) {
      const questions = analysisResult.analysis.missingInformation.slice(0, 3);
      steps.push({
        actionLabel: "Continue care",
        description: `Review ${formatList(questions)} before the next update.`,
        petName: displayName,
        title: `Follow up on the latest guidance for ${displayName}.`,
      });
      return;
    }

    if (hasNoRecentCareUpdate(profile, careEntriesByPetId)) {
      steps.push({
        actionHref: `/dogs/${profile.id}/memories`,
        actionLabel: "View memories",
        description: "No recent care update is recorded for this profile yet.",
        petName: displayName,
        title: `No recent care update recorded for ${displayName}.`,
      });
    }
  });

  return steps.slice(0, 4);
}

export function buildProfileStatus(
  profile: DogProfileWithMemories,
  careEntries: CareEntryWithPetName[] = [],
) {
  const completeness = buildProfileCompleteness(profile);
  const profileActionFields = getProfileActionFields(completeness);
  if (profileActionFields.length > 0) {
    return `Profile started. Add ${formatList(profileActionFields)} when ready.`;
  }

  if (hasNoRecentCareUpdate(profile, new Set(careEntries.map((entry) => entry.pet_profile_id)))) {
    return "No recent care update recorded.";
  }

  return "Profile details saved.";
}

function hasNoRecentCareUpdate(
  profile: DogProfileWithMemories,
  careEntryPetIds: Set<string>,
) {
  return (
    profile.created_at === profile.updated_at &&
    profile.dog_memories.length === 0 &&
    (profile.dog_product_feedback || []).length === 0 &&
    !careEntryPetIds.has(profile.id)
  );
}

function formatFeedbackType(type: string) {
  if (type === "saved") return "saved";
  if (type === "tried") return "tried";
  if (type === "worked") return "worked";
  if (type === "did_not_work") return "didn't work";
  if (type === "too_expensive") return "too expensive";
  return "avoid";
}

function formatList(values: string[]) {
  if (values.length === 0) return "";
  if (values.length === 1) return values[0];
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}

function truncateText(value: string, maxLength: number) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function compareNewestFirst<T extends { created_at: string }>(left: T, right: T) {
  return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
}
