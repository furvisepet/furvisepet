"use client";

import { Suspense, useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { PetLimitScreen } from "../components/pet-limit-screen";
import { Notice, PrimaryButton, SecondaryButton, TextButton } from "../components/product-primitives";
import { normalizeAddPetName, isValidAddPetName, validateApproximatePetAge } from "../lib/add-pet-validation";
import { setActivePetId } from "../lib/active-pet";
import { useConfirmedSupabaseAuth } from "../lib/auth-session";
import { NEW_PET_ONBOARDING_PATH, buildLoginHref } from "../lib/auth-routing";
import {
  beginAddPetDraft, clearCompletedOnboardingState, clearNewPetOnboardingState, getActiveAddPetDraftId,
  readAddPetDraft, saveAddPetDraft, type AddPetDraftV2,
} from "../lib/onboarding-drafts";
import { resolvePetCreationAccessForUser, type PetCreationAccess } from "../lib/pet-limit";
import { initialProfile, normalizeAvoidIngredientValues, type PetProfile } from "../lib/petwise";
import { isPetLimitReachedError, PROFILE_ID_STORAGE_KEY, savePetProfileForUser } from "../lib/supabase";
import { buildOnboardingInitializationKey } from "./initialization-key";
import { OnboardingFooter, OnboardingSurface, OnboardingViewport } from "./onboarding-surface";
import { getWeightPlausibilityWarning } from "./weight-warning";

type StepProps = { draft: AddPetDraftV2; headingRef: RefObject<HTMLHeadingElement | null>; update: (values: Partial<AddPetDraftV2>) => void };
type PostCreatePet = { id: string; name: string };

const STEP_HEADING_IDS = ["species-heading", "basic-heading", "care-heading", "review-heading"] as const;
const fieldClass = "min-h-12 w-full min-w-0 rounded-[var(--radius-md)] border border-[var(--input-border)] bg-[var(--input-background)] px-4 text-base text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus:border-[var(--focus-ring)] focus:ring-2 focus:ring-[var(--focus)] disabled:bg-[var(--surface-secondary)]";
const onboardingPrimaryClass = "onboarding-primary-action";

export default function OnboardingPage() {
  return <Suspense fallback={null}><OnboardingGate /></Suspense>;
}

function OnboardingGate() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status, user } = useConfirmedSupabaseAuth();
  const [access, setAccess] = useState<PetCreationAccess | null>(null);
  const [draftState, setDraftState] = useState<{ draft: AddPetDraftV2; id: string } | null>(null);
  const [resumeId, setResumeId] = useState("");
  const [error, setError] = useState("");
  const redirectRef = useRef(false);
  const mode = searchParams.get("mode") || "new";
  const draftId = searchParams.get("draft") || "";
  const requestedPetId = searchParams.get("pet") || "";
  const initializationKey = buildOnboardingInitializationKey({
    draftId,
    mode,
    requestedPetId,
    userId: status === "signedIn" ? user?.id || "" : "",
  });

  useEffect(() => {
    if (status !== "signedOut" || redirectRef.current) return;
    redirectRef.current = true;
    const currentPath = `${window.location.pathname}${window.location.search}`;
    router.replace(buildLoginHref(currentPath === "/onboarding" ? NEW_PET_ONBOARDING_PATH : currentPath));
  }, [router, status]);

  const initializeOnboarding = useEffectEvent(async (isActive: () => boolean) => {
    if (status !== "signedIn" || !user) return;
    try {
      setError(""); setAccess(null); setDraftState(null); setResumeId("");
      if (mode === "edit") {
        const petId = requestedPetId || window.localStorage.getItem(PROFILE_ID_STORAGE_KEY) || "";
        router.replace(petId ? `/pets/${encodeURIComponent(petId)}/edit` : "/pets"); return;
      }
      const resolved = await resolvePetCreationAccessForUser(user);
      if (!isActive()) return;
      setAccess(resolved);
      if (!resolved.allowed) return;
      if (mode === "resume") {
        const activeDraftId = getActiveAddPetDraftId(window.localStorage, user.id);
        const savedDraft = readAddPetDraft(window.localStorage, activeDraftId, user.id);
        if (activeDraftId && savedDraft) { setResumeId(activeDraftId); return; }
      }
      if (mode === "quick-start") {
        const savedDraft = readAddPetDraft(window.localStorage, draftId, user.id);
        if (savedDraft) { setDraftState({ draft: savedDraft, id: draftId }); return; }
      }
      clearNewPetOnboardingState({ localStorage: window.localStorage, sessionStorage: window.sessionStorage }, user.id);
      const fresh = beginAddPetDraft(window.localStorage, user.id);
      router.replace(`/onboarding?mode=quick-start&draft=${encodeURIComponent(fresh.id)}`);
    } catch { if (isActive()) setError("Furvise could not prepare pet setup. Please try again."); }
  });

  useEffect(() => {
    if (!initializationKey) return;
    let active = true;
    window.queueMicrotask(() => {
      if (active) void initializeOnboarding(() => active);
    });
    return () => { active = false; };
  }, [initializationKey]);

  if (access && !access.allowed) return <PetLimitScreen access={access} />;
  if (error) return <OnboardingViewport><Notice tone="warning">{error}</Notice></OnboardingViewport>;
  if (resumeId && user) return <ResumeChoice
    onCancel={() => router.replace("/pets")}
    onResume={() => router.replace(`/onboarding?mode=quick-start&draft=${encodeURIComponent(resumeId)}`)}
    onStartOver={() => { clearNewPetOnboardingState({ localStorage: window.localStorage, sessionStorage: window.sessionStorage }, user.id); const fresh = beginAddPetDraft(window.localStorage, user.id); router.replace(`/onboarding?mode=quick-start&draft=${encodeURIComponent(fresh.id)}`); }}
  />;
  if (!draftState || !user) return <OnboardingViewport><p className="py-12 text-center text-[var(--text-secondary)]">Preparing pet setup...</p></OnboardingViewport>;
  return <AddPetFlow draftId={draftState.id} initialDraft={draftState.draft} onBlocked={(next) => { setAccess(next); setDraftState(null); }} user={user} />;
}

function AddPetFlow({ draftId, initialDraft, onBlocked, user }: { draftId: string; initialDraft: AddPetDraftV2; onBlocked: (access: PetCreationAccess) => void; user: User }) {
  const router = useRouter();
  const [draft, setDraft] = useState(initialDraft);
  const [savedPet, setSavedPet] = useState<PostCreatePet | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const stepContentRef = useRef<HTMLDivElement>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const previousStepRef = useRef<AddPetDraftV2["step"]>(initialDraft.step);

  useEffect(() => { saveAddPetDraft(window.localStorage, draftId, draft, user.id); }, [draft, draftId, user.id]);
  useEffect(() => {
    if (previousStepRef.current === draft.step) return;
    previousStepRef.current = draft.step;
    const frame = window.requestAnimationFrame(() => {
      stepHeadingRef.current?.focus({ preventScroll: true });
      stepContentRef.current?.scrollTo({ behavior: "auto", top: 0 });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [draft.step]);

  function update(values: Partial<AddPetDraftV2>) { setDraft((current) => ({ ...current, ...values, version: 2 })); setError(""); }
  function goBack() { if (draft.step === 0) return cancel(); update({ step: Math.max(0, draft.step - 1) as AddPetDraftV2["step"] }); }
  function cancel() {
    if (hasEnteredDetails(draft) && !window.confirm("Leave pet setup and discard this draft?")) return;
    clearNewPetOnboardingState({ localStorage: window.localStorage, sessionStorage: window.sessionStorage }, user.id); router.replace("/pets");
  }
  function continueFromCurrent() {
    if (draft.step === 0) { if (draft.species) update({ step: 1 }); return; }
    if (draft.step === 1) {
      if (!normalizeAddPetName(draft.name)) return setError("Add your pet's name to continue.");
      const ageError = draft.ageValue.trim()
        ? validateApproximatePetAge(draft.ageValue, draft.ageUnit, draft.ageUnknown)
        : "";
      if (ageError) return setError(ageError);
      update({ step: 2 }); return;
    }
    if (draft.step === 2) update({ step: 3 });
  }
  async function createPet() {
    if (saving || !draft.species || !isValidAddPetName(draft.name)) return;
    setSaving(true); setError("");
    try {
      const access = await resolvePetCreationAccessForUser(user);
      if (!access.allowed) return onBlocked(access);
      const profile: PetProfile = {
        ...initialProfile, name: normalizeAddPetName(draft.name), species: draft.species,
        age: draft.ageValue, ageUnit: draft.ageUnit, ageUnknown: draft.ageUnknown,
        sex: draft.sex, breed: draft.breedUnknown ? "" : draft.breed,
        weight: draft.weightValue, weightUnit: draft.weightUnit, weightUnknown: draft.weightUnknown,
        currentFood: draft.currentFood, currentFoodUnknown: draft.currentFoodUnknown,
        mainConcern: draft.mainConcern as PetProfile["mainConcern"], otherConcern: draft.otherConcern,
        avoidIngredients: normalizeAvoidIngredientValues([...draft.avoidIngredients, ...draft.customAvoidIngredient.split(",")]),
        avoidIngredientsNoneKnown: draft.avoidIngredientsNoneKnown,
        monthlyBudget: draft.monthlyBudget, routineNote: draft.routineNote,
      };
      const saved = await savePetProfileForUser(profile, user, null);
      if (saved.species !== "dog" && saved.species !== "cat") throw new Error("The saved pet profile is missing its species.");
      setActivePetId(window.localStorage, saved.id);
      clearCompletedOnboardingState({ localStorage: window.localStorage, sessionStorage: window.sessionStorage }, saved.id, user.id);
      setSavedPet({
        id: saved.id,
        name: normalizeAddPetName(saved.name),
      });
    } catch (saveFailure) {
      if (isPetLimitReachedError(saveFailure)) { const access = await resolvePetCreationAccessForUser(user).catch(() => null); if (access) return onBlocked({ ...access, allowed: false }); }
      setError(saveFailure instanceof Error ? saveFailure.message : "Furvise could not add this pet. Please try again.");
    } finally { setSaving(false); }
  }

  if (savedPet) return <PostCreateActivation pet={savedPet} />;
  const ageIsValid = !draft.ageValue.trim() || !validateApproximatePetAge(draft.ageValue, draft.ageUnit, draft.ageUnknown);
  const canContinue = draft.step === 0 ? Boolean(draft.species) : draft.step === 1 ? isValidAddPetName(draft.name) && ageIsValid : true;
  return <OnboardingViewport>
    <OnboardingStepShell
      canContinue={canContinue}
      cancel={cancel}
      continueFromCurrent={continueFromCurrent}
      createPet={() => void createPet()}
      goBack={goBack}
      headingId={STEP_HEADING_IDS[draft.step]}
      name={normalizeAddPetName(draft.name)}
      saving={saving}
      step={draft.step}
      stepContentRef={stepContentRef}
    >
      {draft.step === 0 ? <SpeciesStep draft={draft} headingRef={stepHeadingRef} update={update} /> : null}
      {draft.step === 1 ? <BasicDetailsStep draft={draft} headingRef={stepHeadingRef} update={update} /> : null}
      {draft.step === 2 ? <OptionalContextStep draft={draft} headingRef={stepHeadingRef} update={update} /> : null}
      {draft.step === 3 ? <ReviewStep draft={draft} edit={(step) => update({ step })} headingRef={stepHeadingRef} /> : null}
      {error ? <div className="mt-5"><Notice tone="warning">{error}</Notice></div> : null}
    </OnboardingStepShell>
  </OnboardingViewport>;
}

function OnboardingStepShell({ canContinue, cancel, children, continueFromCurrent, createPet, goBack, headingId, name, saving, step, stepContentRef }: {
  canContinue: boolean; cancel: () => void; children: React.ReactNode; continueFromCurrent: () => void; createPet: () => void;
  goBack: () => void; headingId: string; name: string; saving: boolean; step: AddPetDraftV2["step"]; stepContentRef: RefObject<HTMLDivElement | null>;
}) {
  return <OnboardingSurface
    contentRef={stepContentRef}
    footer={<OnboardingFooter
      primary={step === 3
        ? <PrimaryButton className={`w-full ${onboardingPrimaryClass}`} disabled={saving} loading={saving} onClick={createPet} type="button">Create {name}&apos;s profile</PrimaryButton>
        : <PrimaryButton className={`w-full ${onboardingPrimaryClass}`} disabled={!canContinue} onClick={continueFromCurrent} type="button">Continue</PrimaryButton>}
      secondary={<div className={`flex min-h-11 items-center ${step > 0 ? "justify-between" : "justify-center"}`}>
        {step > 0 ? <TextButton className="min-h-11 px-4" disabled={saving} onClick={goBack} type="button">Back</TextButton> : null}
        <TextButton className="min-h-11 px-4" disabled={saving} onClick={cancel} type="button">Cancel</TextButton>
      </div>}
    />}
    headingId={headingId}
    step={step}
  >
    {children}
  </OnboardingSurface>;
}

function SpeciesStep({ draft, headingRef, update }: StepProps) {
  return <section aria-labelledby="species-heading">
    <h1 aria-label="Step 1 of 4, Who are we setting up?" className="text-3xl font-bold tracking-[-0.03em] outline-none sm:text-4xl" id="species-heading" ref={headingRef} tabIndex={-1}>Who are we setting up?</h1>
    <p className="mt-2 text-[var(--text-secondary)]">Choose your pet to get started.</p>
    <div className="mt-6 grid gap-4 sm:grid-cols-2">{(["dog", "cat"] as const).map((species) => {
      const selected = draft.species === species; const label = title(species);
      return <button aria-pressed={selected} className={`relative flex min-h-24 min-w-0 items-center justify-center rounded-[var(--radius-lg)] border p-5 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${selected ? "border-[var(--border-strong)] bg-[var(--selected-background)] shadow-[inset_0_0_0_1px_var(--border-strong)]" : "border-[var(--border-subtle)] bg-[var(--surface-primary)] hover:bg-[var(--surface-hover)]"}`} key={species} onClick={() => update({ species })} type="button">
        <span className="text-xl font-semibold">{label}</span>
        {selected ? <span aria-hidden="true" className="absolute right-4 top-4 font-bold">✓</span> : null}
      </button>;
    })}</div>
  </section>;
}

function BasicDetailsStep({ draft, headingRef, update }: StepProps) {
  const petName = normalizeAddPetName(draft.name);
  return <section aria-labelledby="basic-heading">
    <StepHeading heading={petName ? `Tell us about ${petName}` : "Tell us about your pet"} headingRef={headingRef} id="basic-heading" step={2} />
    <div className="mt-5 grid gap-3">
      <Field label="Name" required><input aria-label="Name" className={fieldClass} maxLength={80} onChange={(event) => update({ name: event.target.value })} value={draft.name} /></Field>
      <div className="grid gap-3 sm:grid-cols-2 sm:items-start">
        <Field label="Age"><div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div className="grid grid-cols-[minmax(0,1fr)_7.5rem] gap-2"><input aria-label="Age" className={fieldClass} disabled={draft.ageUnknown} inputMode="decimal" onChange={(event) => update({ ageValue: event.target.value })} value={draft.ageValue} /><select aria-label="Age unit" className={fieldClass} disabled={draft.ageUnknown} onChange={(event) => update({ ageUnit: event.target.value === "months" ? "months" : "years" })} value={draft.ageUnit}><option value="months">Months</option><option value="years">Years</option></select></div><InlineUnknownChoice checked={draft.ageUnknown} onChange={(checked) => update({ ageUnknown: checked })} /></div></Field>
        <Field label="Sex"><div className="grid grid-cols-3 gap-2">{(["female", "male", "not_sure"] as const).map((sex) => <OptionButton key={sex} label={sex === "not_sure" ? "Not sure" : title(sex)} onClick={() => update({ sex })} selected={draft.sex === sex} />)}</div></Field>
      </div>
      <Field label="Breed"><div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><input aria-label="Breed" className={fieldClass} disabled={draft.breedUnknown} onChange={(event) => update({ breed: event.target.value })} value={draft.breed} /><InlineUnknownChoice checked={draft.breedUnknown} onChange={(checked) => update({ breedUnknown: checked })} /></div></Field>
    </div>
  </section>;
}

function OptionalContextStep({ draft, headingRef, update }: StepProps) {
  const petName = normalizeAddPetName(draft.name);
  const weightWarning = getWeightPlausibilityWarning({
    species: draft.species,
    unit: draft.weightUnit,
    unknown: draft.weightUnknown,
    value: draft.weightValue,
  });
  return <section aria-labelledby="care-heading">
    <StepHeading heading={petName ? `Anything Furvise should know about ${petName}?` : "Anything Furvise should know?"} headingRef={headingRef} id="care-heading" step={3} />
    <p className="mt-2 text-[var(--text-secondary)]">Optional. You can always add more later.</p>
    <div className="mt-7 grid gap-6">
      <Field label="Weight">
        <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-2">
          <input aria-label="Weight" className={fieldClass} disabled={draft.weightUnknown} inputMode="decimal" onChange={(event) => update({ weightValue: event.target.value })} value={draft.weightValue} />
          <select aria-label="Weight unit" className={fieldClass} disabled={draft.weightUnknown} onChange={(event) => update({ weightUnit: event.target.value === "kg" ? "kg" : "lb" })} value={draft.weightUnit}><option value="lb">lb</option><option value="kg">kg</option></select>
        </div>
        <InlineUnknownChoice checked={draft.weightUnknown} onChange={(checked) => update({ weightUnknown: checked })} />
        {weightWarning ? <p aria-live="polite" className="text-sm text-[var(--warning-text)]">{weightWarning}</p> : null}
      </Field>
      <Field label="Anything else?"><textarea aria-label="Anything else?" className={`${fieldClass} min-h-28 py-3`} maxLength={500} onChange={(event) => update({ routineNote: event.target.value })} placeholder="Food, allergies, routines, concerns, habits..." value={draft.routineNote} /></Field>
    </div>
  </section>;
}

function ReviewStep({ draft, edit, headingRef }: Omit<StepProps, "update"> & { edit: (step: AddPetDraftV2["step"]) => void }) {
  const age = draft.ageUnknown ? "Not sure" : draft.ageValue ? `${draft.ageValue} ${draft.ageUnit}` : "";
  const breed = draft.breedUnknown ? "Not sure" : draft.breed;
  const weight = draft.weightUnknown ? "Not sure" : draft.weightValue ? `${draft.weightValue} ${draft.weightUnit}` : "";
  return <section aria-labelledby="review-heading">
    <StepHeading heading={`Finish setting up ${normalizeAddPetName(draft.name)}`} headingRef={headingRef} id="review-heading" step={4} />
    <p className="mt-2 text-sm text-[var(--text-secondary)]">Review the essentials. You can add or change optional details later.</p>
    <div className="mt-6 grid gap-4">
      <ReviewGroup edit={() => edit(1)} title="Basic details"><ReviewRows rows={[["Species", title(draft.species || "")], ["Name", normalizeAddPetName(draft.name)], ["Age", age], ["Sex", draft.sex ? title(draft.sex.replace("_", " ")) : ""], ["Breed", breed]]} /></ReviewGroup>
      {(weight || draft.routineNote.trim()) ? <ReviewGroup edit={() => edit(2)} title="Optional context"><ReviewRows rows={[["Weight", weight], ["Note", draft.routineNote.trim()]]} /></ReviewGroup> : null}
    </div>
  </section>;
}

function ReviewGroup({ children, edit, title: groupTitle }: { children: React.ReactNode; edit: () => void; title: string }) {
  return <section className="rounded-[var(--radius-md)] border border-[var(--line)] p-4"><div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-base font-semibold">{groupTitle}</h2><button className="min-h-11 px-2 text-sm font-semibold underline-offset-4 hover:underline" onClick={edit} type="button">Edit</button></div>{children}</section>;
}

function ReviewRows({ rows }: { rows: [string, string][] }) {
  const visible = rows.filter(([, value]) => Boolean(value));
  return <dl className="grid gap-x-5 gap-y-2 sm:grid-cols-2">{visible.map(([label, value]) => <div className="min-w-0" key={label}><dt className="text-xs font-medium text-[var(--text-tertiary)]">{label}</dt><dd className="break-words text-sm text-[var(--text-primary)]">{value}</dd></div>)}</dl>;
}

function StepHeading({ heading, headingRef, id, step }: { heading: string; headingRef: RefObject<HTMLHeadingElement | null>; id: string; step: number }) {
  return <h1 aria-label={`Step ${step} of 4, ${heading}`} className="min-w-0 text-3xl font-bold tracking-[-0.03em] outline-none sm:text-4xl" id={id} ref={headingRef} tabIndex={-1}>{heading}</h1>;
}

function Field({ children, label, required = false }: { children: React.ReactNode; label: string; required?: boolean }) { return <div className="grid min-w-0 gap-1.5"><span className="text-sm font-semibold">{label}{required ? <span className="sr-only"> required</span> : null}</span>{children}</div>; }
function InlineUnknownChoice({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) { return <label className="inline-flex min-h-11 w-fit cursor-pointer items-center gap-2 text-sm font-medium text-[var(--text-secondary)]"><input checked={checked} className="h-5 w-5 shrink-0" onChange={(event) => onChange(event.target.checked)} type="checkbox" /><span>Not sure</span></label>; }
function OptionButton({ label, onClick, selected }: { label: string; onClick: () => void; selected: boolean }) { return <button aria-pressed={selected} className={`min-h-11 min-w-0 rounded-[var(--radius-md)] border px-3 py-2 text-sm font-semibold ${selected ? "border-[var(--border-strong)] bg-[var(--selected-background)]" : "border-[var(--line)] bg-[var(--surface-primary)]"}`} onClick={onClick} type="button">{label}</button>; }
function PostCreateActivation({ pet }: { pet: PostCreatePet }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    window.scrollTo({ behavior: "auto", left: 0, top: 0 });
    headingRef.current?.focus({ preventScroll: true });
    const frame = window.requestAnimationFrame(() => window.scrollTo({ behavior: "auto", left: 0, top: 0 }));
    return () => window.cancelAnimationFrame(frame);
  }, []);
  const todayHref = `/today?pet=${encodeURIComponent(pet.id)}`;
  const askHref = `/ask?pet=${encodeURIComponent(pet.id)}&from=onboarding`;
  return <OnboardingViewport><OnboardingSurface
    complete
    footer={<OnboardingFooter
      primary={<PrimaryButton className={`w-full ${onboardingPrimaryClass}`} href={askHref}>Ask Furvise about {pet.name}</PrimaryButton>}
      secondary={<div className="flex min-h-11 items-center justify-center"><TextButton className="min-h-11 px-4" href={todayHref}>Go to Today</TextButton></div>}
    />}
    headingId="onboarding-success-heading"
    state="success"
  ><div className="flex min-h-full flex-col justify-center text-center" data-ui="post-create-success-content"><h1 className="break-words text-[2rem] font-semibold leading-[1.08] tracking-[-0.035em] outline-none sm:text-[2.375rem]" id="onboarding-success-heading" ref={headingRef} tabIndex={-1}>{pet.name} is ready</h1><p className="mx-auto mt-3 max-w-sm text-base leading-7 text-[var(--text-secondary)]">Start with a question. Furvise will use what you shared.</p></div></OnboardingSurface></OnboardingViewport>;
}

function ResumeChoice({ onCancel, onResume, onStartOver }: { onCancel: () => void; onResume: () => void; onStartOver: () => void }) { return <OnboardingViewport><section className="mx-auto max-w-[700px] rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface-primary)] p-6 sm:p-8"><h1 className="text-3xl font-bold">Resume pet setup?</h1><p className="mt-3 text-[var(--text-secondary)]">An unfinished setup is saved on this device.</p><div className="mt-7 grid gap-2"><PrimaryButton className={onboardingPrimaryClass} onClick={onResume} type="button">Resume setup</PrimaryButton><SecondaryButton onClick={onStartOver} type="button">Start over</SecondaryButton><TextButton onClick={onCancel} type="button">Cancel</TextButton></div></section></OnboardingViewport>; }

function hasEnteredDetails(draft: AddPetDraftV2) { return Boolean(draft.species || draft.name.trim() || draft.ageValue || draft.breed || draft.weightValue || draft.currentFood || draft.mainConcern || draft.avoidIngredients.length || draft.avoidIngredientsNoneKnown || draft.monthlyBudget || draft.routineNote); }
function title(value: string) { return value ? value[0].toUpperCase() + value.slice(1) : value; }
