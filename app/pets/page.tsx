"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppPage } from "../components/app-page";
import { PetOverflowMenu } from "../components/pet-overflow-menu";
import {
  EmptyState,
  LoadingState,
  Notice,
  PageHeader,
  PetIdentity,
  PrimaryButton,
  SecondaryButton,
  SoftButton,
  TextAction,
  TextButton,
} from "../components/product-primitives";
import { buildPetDeletionReauthenticationHref, NEW_PET_ONBOARDING_PATH } from "../lib/auth-routing";
import { clearEditPetOnboardingDraft } from "../lib/onboarding-drafts";
import { clearActivePetId } from "../lib/active-pet";
import { useRequireConfirmedSupabaseAuth } from "../lib/auth-session";
import { formatCareEntryTimestamp, formatCareNotePreview } from "../lib/care-log.mjs";
import { formatPetDisplayName, formatSpecies } from "../lib/petwise";
import { useAppDataVersion } from "../lib/navigation/app-data-freshness";
import type { AskConversationSummary } from "../lib/ask-conversations";
import {
  deleteDogProfileForUser,
  getCurrentUser,
  getCurrentAccessToken,
  isRecentAuthenticationRequiredError,
  listRecentCareEntries,
  loadDogProfilesWithMemories,
  type CareEntryWithPetName,
  type DogProfileWithMemories,
} from "../lib/supabase";

export default function PetsPage() {
  const router = useRouter();
  const appDataVersion = useAppDataVersion();
  const { status: authStatus, user } = useRequireConfirmedSupabaseAuth();
  const [profiles, setProfiles] = useState<DogProfileWithMemories[]>([]);
  const [entries, setEntries] = useState<CareEntryWithPetName[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [conversations, setConversations] = useState<AskConversationSummary[]>([]);

  useEffect(() => {
    if (authStatus !== "signedIn" || !user) return;
    let active = true;
    Promise.all([loadDogProfilesWithMemories(user), listRecentCareEntries(200)])
      .then(([profileRows, entryRows]) => {
        if (!active) return;
        setProfiles(profileRows);
        setEntries(entryRows);
        getCurrentAccessToken().then(async (token) => {
          if (!token || !active) return;
          const response = await fetch("/api/ask/conversations", { headers: { Authorization: `Bearer ${token}` } });
          if (!response.ok) return;
          const payload = await response.json() as { conversations?: AskConversationSummary[] };
          if (active) setConversations(payload.conversations || []);
        }).catch(() => undefined);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Furvise could not load your pets.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [appDataVersion, authStatus, user]);

  async function deleteProfile(profile: DogProfileWithMemories) {
    if (!window.confirm(`Delete ${formatPetDisplayName(profile.name)}'s profile? This cannot be undone.`)) return;
    try {
      const currentUser = await getCurrentUser();
      if (!currentUser) throw new Error("Please sign in again.");
      await deleteDogProfileForUser(profile.id, currentUser);
      clearEditPetOnboardingDraft(window.localStorage, profile.id);
      clearActivePetId(window.localStorage, profile.id);
      setProfiles((current) => current.filter((item) => item.id !== profile.id));
      setEntries((current) => current.filter((entry) => entry.pet_profile_id !== profile.id));
    } catch (deleteError) {
      if (isRecentAuthenticationRequiredError(deleteError)) {
        router.push(buildPetDeletionReauthenticationHref(profile.id));
        return;
      }
      setError(deleteError instanceof Error ? deleteError.message : "Furvise could not delete that profile.");
    }
  }

  return (
    <AppPage layout="workspace" shell="standard">
      <PageHeader
        actions={profiles.length ? <PrimaryButton href={NEW_PET_ONBOARDING_PATH}>Add pet</PrimaryButton> : undefined}
        supportingText="A simple home for each pet in your care."
        title="Pets"
      />

      {error ? <div className="mt-8"><Notice tone="warning">{error}</Notice></div> : null}
      {loading ? <LoadingState label="Loading pets" /> : null}

      {!loading && !error && profiles.length === 0 ? (
        <div className="mt-10">
          <EmptyState action={<PrimaryButton href={NEW_PET_ONBOARDING_PATH}>Add your first pet</PrimaryButton>} description="Keep everyday updates, questions, and vet notes together from the start." title="No pets yet" />
        </div>
      ) : null}

      {!loading && profiles.length ? (
        <>
          <section className="mt-10 divide-y divide-[var(--line)] rounded-2xl border border-[var(--line)] bg-[var(--surface-supportive)] px-5 sm:px-7">
            {profiles.map((profile) => <PetSummary entries={entries} key={profile.id} onDelete={() => deleteProfile(profile)} profile={profile} />)}
          </section>
          {profiles.length === 1 ? (
            <section className="mt-6 max-w-[760px] rounded-2xl border border-[var(--line)] bg-[var(--surface-primary)] p-6 sm:p-7" aria-labelledby="connected-pet-story">
              {entries.some((entry) => entry.pet_profile_id === profiles[0].id) || (profiles[0].lifecycle_status || "active") !== "active" ? <PetHistoryDepth conversations={conversations} entries={entries} profile={profiles[0]} /> : <PetStartHistory profile={profiles[0]} />}
            </section>
          ) : null}
        </>
      ) : null}
    </AppPage>
  );
}

function PetStartHistory({ profile }: { profile: DogProfileWithMemories }) {
  const name = formatPetDisplayName(profile.name);
  return <><h2 className="text-xl font-semibold text-[var(--text-primary)]" id="connected-pet-story">Start {name}&apos;s care history</h2><p className="mt-2 leading-7 text-[var(--text-secondary)]">Add a note about food, appetite, routines, symptoms, or anything you may want to remember later.</p><div className="mt-5 flex flex-wrap items-center gap-2"><SoftButton href={`/care-log?pet=${profile.id}&new=1`}>Add update</SoftButton><SecondaryButton href={`/ask?pet=${profile.id}`}>Ask about {name}</SecondaryButton></div></>;
}

function PetHistoryDepth({ conversations, entries, profile }: { conversations: AskConversationSummary[]; entries: CareEntryWithPetName[]; profile: DogProfileWithMemories }) {
  const name = formatPetDisplayName(profile.name);
  const latest = entries.find((entry) => entry.pet_profile_id === profile.id);
  const conversation = conversations.find((item) => item.petId === profile.id);
  return <><h2 className="text-xl font-semibold text-[var(--text-primary)]" id="connected-pet-story">Latest for {name}</h2><dl className="mt-5 grid gap-5 sm:grid-cols-2"><div><dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">Latest update</dt><dd className="mt-2 leading-7 text-[var(--text-primary)]">{latest ? formatCareNotePreview(latest.note, 120) : "No update yet"}</dd></div><div><dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">Latest conversation</dt><dd className="mt-2 leading-7 text-[var(--text-primary)]">{conversation?.title || "No conversation yet"}</dd></div></dl><div className="mt-5"><TextButton href={`/ask?pet=${profile.id}`}>Ask about {name}</TextButton></div></>;
}

function PetSummary({ entries, onDelete, profile }: { entries: CareEntryWithPetName[]; onDelete: () => void; profile: DogProfileWithMemories }) {
  const latest = useMemo(() => entries.find((entry) => entry.pet_profile_id === profile.id), [entries, profile.id]);
  const name = formatPetDisplayName(profile.name);
  const age = formatAge(profile);
  const lifecycleStatus = profile.lifecycle_status || "active";

  return (
    <article className="grid gap-6 py-7 md:grid-cols-[minmax(220px,0.8fr)_minmax(280px,1fr)_auto] md:items-center">
      <PetIdentity detail={[formatSpecies(profile.species), age].filter(Boolean).join(" · ")} name={name} size="large" />
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">{lifecycleStatus === "active" ? "Care goal" : "Profile"}</p>
        <p className="mt-1 max-w-lg leading-6 text-[var(--text-primary)]">{lifecycleStatus === "deceased" ? `${name}'s history is preserved.` : lifecycleStatus === "archived" ? "This profile is archived." : profile.main_concern?.trim() || "No current care goal recorded"}</p>
        <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
          <span className="font-medium text-[var(--text-primary)]">Most recent update:</span>{" "}{latest ? `${formatCareEntryTimestamp(latest.occurred_at)} · ${formatCareNotePreview(latest.note, 70)}` : "Nothing recorded yet"}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 md:justify-end">
        <TextAction arrow href={`/pets/${profile.id}`}>Open profile</TextAction>
        {lifecycleStatus === "active" ? <SoftButton href={`/care-log?pet=${profile.id}&new=1`}>Add update</SoftButton> : null}
        <SecondaryButton href={`/ask?pet=${profile.id}`}>Ask about {name}</SecondaryButton>
        <PetOverflowMenu editHref={`/pets/${profile.id}/edit`} name={name} notesHref={`/pets/${profile.id}#saved-details`} onDelete={onDelete} />
      </div>
    </article>
  );
}

function formatAge(profile: DogProfileWithMemories) {
  if (profile.age_value === null || profile.age_value === undefined) return "";
  const unit = profile.age_unit === "months" ? "months" : "years";
  return `${profile.age_value} ${unit}`;
}
