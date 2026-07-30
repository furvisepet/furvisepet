"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useEffect, useRef, useState, type RefObject } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { BrandMark } from "../components/brand-mark";
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
import { avoidIngredientChips, initialProfile, MAIN_CONCERN_OPTIONS, normalizeAvoidIngredientValues, type PetProfile } from "../lib/petwise";
import { isPetLimitReachedError, PROFILE_ID_STORAGE_KEY, savePetProfileForUser } from "../lib/supabase";

type SavedPet = { id: string; name: string; species: "dog" | "cat" };
type StepProps = { draft: AddPetDraftV2; headingRef: RefObject<HTMLHeadingElement | null>; update: (values: Partial<AddPetDraftV2>) => void };

const STEP_HEADING_IDS = ["species-heading", "basic-heading", "care-heading", "review-heading"] as const;
const fieldClass = "min-h-12 w-full min-w-0 rounded-[var(--radius-md)] border border-[var(--input-border)] bg-[var(--input-background)] px-4 text-base text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus:border-[var(--focus-ring)] focus:ring-2 focus:ring-[var(--focus)] disabled:bg-[var(--surface-secondary)]";

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

  useEffect(() => {
    if (status !== "signedOut" || redirectRef.current) return;
    redirectRef.current = true;
    const currentPath = `${window.location.pathname}${window.location.search}`;
    router.replace(buildLoginHref(currentPath === "/onboarding" ? NEW_PET_ONBOARDING_PATH : currentPath));
  }, [router, status]);

  useEffect(() => {
    if (status !== "signedIn" || !user) return;
    let active = true;
    void (async () => {
      try {
        setError(""); setAccess(null); setDraftState(null); setResumeId("");
        if (mode === "edit") {
          const petId = requestedPetId || window.localStorage.getItem(PROFILE_ID_STORAGE_KEY) || "";
          router.replace(petId ? `/pets/${encodeURIComponent(petId)}/edit` : "/pets"); return;
        }
        const resolved = await resolvePetCreationAccessForUser(user);
        if (!active) return;
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
      } catch { if (active) setError("Furvise could not prepare pet setup. Please try again."); }
    })();
    return () => { active = false; };
  }, [draftId, mode, requestedPetId, router, status, user]);

  if (access && !access.allowed) return <PetLimitScreen access={access} />;
  if (error) return <OnboardingShell><Notice tone="warning">{error}</Notice></OnboardingShell>;
  if (resumeId && user) return <ResumeChoice
    onCancel={() => router.replace("/pets")}
    onResume={() => router.replace(`/onboarding?mode=quick-start&draft=${encodeURIComponent(resumeId)}`)}
    onStartOver={() => { clearNewPetOnboardingState({ localStorage: window.localStorage, sessionStorage: window.sessionStorage }, user.id); const fresh = beginAddPetDraft(window.localStorage, user.id); router.replace(`/onboarding?mode=quick-start&draft=${encodeURIComponent(fresh.id)}`); }}
  />;
  if (!draftState || !user) return <OnboardingShell><p className="py-12 text-center text-[var(--text-secondary)]">Preparing pet setup...</p></OnboardingShell>;
  return <AddPetFlow draftId={draftState.id} initialDraft={draftState.draft} onBlocked={(next) => { setAccess(next); setDraftState(null); }} user={user} />;
}

function AddPetFlow({ draftId, initialDraft, onBlocked, user }: { draftId: string; initialDraft: AddPetDraftV2; onBlocked: (access: PetCreationAccess) => void; user: User }) {
  const router = useRouter();
  const [draft, setDraft] = useState(initialDraft);
  const [savedPet, setSavedPet] = useState<SavedPet | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const stepContainerRef = useRef<HTMLDivElement>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const previousStepRef = useRef<AddPetDraftV2["step"]>(initialDraft.step);

  useEffect(() => { saveAddPetDraft(window.localStorage, draftId, draft, user.id); }, [draft, draftId, user.id]);
  useEffect(() => {
    if (previousStepRef.current === draft.step) return;
    previousStepRef.current = draft.step;
    const frame = window.requestAnimationFrame(() => {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      stepHeadingRef.current?.focus({ preventScroll: true });
      stepContainerRef.current?.scrollIntoView({ block: "start", behavior: reduceMotion ? "auto" : "smooth" });
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
      const ageError = validateApproximatePetAge(draft.ageValue, draft.ageUnit, draft.ageUnknown);
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
      setActivePetId(window.localStorage, saved.id);
      clearCompletedOnboardingState({ localStorage: window.localStorage, sessionStorage: window.sessionStorage }, saved.id, user.id);
      setSavedPet({ id: saved.id, name: normalizeAddPetName(saved.name), species: draft.species });
    } catch (saveFailure) {
      if (isPetLimitReachedError(saveFailure)) { const access = await resolvePetCreationAccessForUser(user).catch(() => null); if (access) return onBlocked({ ...access, allowed: false }); }
      setError(saveFailure instanceof Error ? saveFailure.message : "Furvise could not add this pet. Please try again.");
    } finally { setSaving(false); }
  }

  if (savedPet) return <SuccessStep pet={savedPet} />;
  const canContinue = draft.step === 0 ? Boolean(draft.species) : draft.step === 1 ? isValidAddPetName(draft.name) && !validateApproximatePetAge(draft.ageValue, draft.ageUnit, draft.ageUnknown) : true;
  return <OnboardingShell>
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
      stepContainerRef={stepContainerRef}
    >
      {draft.step === 0 ? <SpeciesStep draft={draft} headingRef={stepHeadingRef} update={update} /> : null}
      {draft.step === 1 ? <BasicDetailsStep draft={draft} headingRef={stepHeadingRef} update={update} /> : null}
      {draft.step === 2 ? <CareDetailsStep draft={draft} headingRef={stepHeadingRef} update={update} /> : null}
      {draft.step === 3 ? <ReviewStep draft={draft} edit={(step) => update({ step })} headingRef={stepHeadingRef} update={update} /> : null}
      {error ? <div className="mt-5"><Notice tone="warning">{error}</Notice></div> : null}
    </OnboardingStepShell>
  </OnboardingShell>;
}

function OnboardingStepShell({ canContinue, cancel, children, continueFromCurrent, createPet, goBack, headingId, name, saving, step, stepContainerRef }: {
  canContinue: boolean; cancel: () => void; children: React.ReactNode; continueFromCurrent: () => void; createPet: () => void;
  goBack: () => void; headingId: string; name: string; saving: boolean; step: AddPetDraftV2["step"]; stepContainerRef: RefObject<HTMLDivElement | null>;
}) {
  return <div aria-labelledby={headingId} className="scroll-mt-24" data-onboarding-step={step + 1} ref={stepContainerRef}>
    <Progress step={step} />
    <div className="mt-4 rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface-primary)] shadow-[var(--shadow-surface-1)]">
      <div className="min-h-[24rem] p-6 sm:p-10">{children}</div>
      <div className="sticky bottom-0 z-10 border-t border-[var(--line)] bg-[var(--surface-primary)] px-6 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 sm:px-10 sm:pb-5">
        {step === 3
          ? <PrimaryButton className="w-full" disabled={saving} loading={saving} onClick={createPet} type="button">Create {name}&apos;s profile</PrimaryButton>
          : <PrimaryButton className="w-full" disabled={!canContinue} onClick={continueFromCurrent} type="button">Continue</PrimaryButton>}
        <div className={`mt-2 flex min-h-11 items-center ${step > 0 ? "justify-between" : "justify-center"}`}>
          {step > 0 ? <TextButton className="min-h-11 px-4" disabled={saving} onClick={goBack} type="button">Back</TextButton> : null}
          <TextButton className="min-h-11 px-4" disabled={saving} onClick={cancel} type="button">Cancel</TextButton>
        </div>
      </div>
    </div>
  </div>;
}

function SpeciesStep({ draft, headingRef, update }: StepProps) {
  return <section aria-labelledby="species-heading">
    <h1 aria-label="Step 1 of 4, Who are we setting up?" className="text-3xl font-bold tracking-[-0.03em] outline-none sm:text-4xl" id="species-heading" ref={headingRef} tabIndex={-1}>Who are we setting up?</h1>
    <p className="mt-2 text-[var(--text-secondary)]">Choose your pet to get started.</p>
    <div className="mt-6 grid gap-4 sm:grid-cols-2">{(["dog", "cat"] as const).map((species) => {
      const selected = draft.species === species; const label = title(species);
      return <button aria-pressed={selected} className={`relative flex min-h-48 min-w-0 flex-col items-center justify-center rounded-[var(--radius-lg)] border p-5 text-center focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${selected ? "border-[var(--border-strong)] bg-[var(--selected-background)] shadow-[inset_0_0_0_1px_var(--border-strong)]" : "border-[var(--border-subtle)] hover:bg-[var(--surface-hover)]"}`} key={species} onClick={() => update({ species })} type="button">
        <Image alt={`${label} illustration`} className="h-28 w-28 object-contain sm:h-32 sm:w-32" height={128} src={`/images/${species}.png`} width={128} />
        <span className="mt-2 text-xl font-semibold">{label}</span><span className="mt-1 text-sm text-[var(--text-secondary)]">Set up a home for your {species}</span>
        {selected ? <span aria-hidden="true" className="absolute right-4 top-4 font-bold">✓</span> : null}
      </button>;
    })}</div>
  </section>;
}

function BasicDetailsStep({ draft, headingRef, update }: StepProps) {
  return <section aria-labelledby="basic-heading">
    <StepHeading draft={draft} heading="Tell us about your pet" headingRef={headingRef} id="basic-heading" step={2} />
    <div className="mt-6 grid gap-4">
      <Field label="Name" required><input className={fieldClass} maxLength={80} onChange={(event) => update({ name: event.target.value })} value={draft.name} /></Field>
      <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
        <Field label="Age"><div className="grid grid-cols-[minmax(0,1fr)_7.5rem] gap-2"><input className={fieldClass} disabled={draft.ageUnknown} inputMode="decimal" onChange={(event) => update({ ageValue: event.target.value })} value={draft.ageValue} /><select className={fieldClass} disabled={draft.ageUnknown} onChange={(event) => update({ ageUnit: event.target.value === "months" ? "months" : "years" })} value={draft.ageUnit}><option value="months">Months</option><option value="years">Years</option></select></div><CompactChoice checked={draft.ageUnknown} label="I'm not sure" onChange={(checked) => update({ ageUnknown: checked })} /></Field>
        <Field label="Sex"><div className="grid grid-cols-3 gap-2">{(["female", "male", "not_sure"] as const).map((sex) => <OptionButton key={sex} label={sex === "not_sure" ? "Not sure" : title(sex)} onClick={() => update({ sex })} selected={draft.sex === sex} />)}</div></Field>
      </div>
      <Field label="Breed"><input className={fieldClass} disabled={draft.breedUnknown} onChange={(event) => update({ breed: event.target.value })} value={draft.breed} /><CompactChoice checked={draft.breedUnknown} label="I'm not sure" onChange={(checked) => update({ breedUnknown: checked })} /></Field>
    </div>
  </section>;
}

function CareDetailsStep({ draft, headingRef, update }: StepProps) {
  function toggleIngredient(ingredient: string) {
    if (ingredient === "None known") { if ((draft.avoidIngredients.length || draft.customAvoidIngredient) && !window.confirm("Clear the selected ingredient exclusions?")) return; update({ avoidIngredients: [], avoidIngredientsNoneKnown: true, customAvoidIngredient: "" }); return; }
    update({ avoidIngredientsNoneKnown: false, avoidIngredients: draft.avoidIngredients.includes(ingredient) ? draft.avoidIngredients.filter((item) => item !== ingredient) : [...draft.avoidIngredients, ingredient] });
  }
  return <section aria-labelledby="care-heading">
    <StepHeading draft={draft} heading="What should Furvise know?" headingRef={headingRef} id="care-heading" step={3} />
    <div className="mt-6 grid gap-6">
      <StepSection title="Physical details"><div className="grid gap-4 sm:grid-cols-2">
        <Field label="Weight"><div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-2"><input className={fieldClass} disabled={draft.weightUnknown} inputMode="decimal" onChange={(event) => update({ weightValue: event.target.value })} value={draft.weightValue} /><select className={fieldClass} disabled={draft.weightUnknown} onChange={(event) => update({ weightUnit: event.target.value === "kg" ? "kg" : "lb" })} value={draft.weightUnit}><option value="lb">lb</option><option value="kg">kg</option></select></div><CompactChoice checked={draft.weightUnknown} label="I'm not sure" onChange={(checked) => update({ weightUnknown: checked })} /></Field>
        <Field label="Current food"><input className={fieldClass} disabled={draft.currentFoodUnknown} onChange={(event) => update({ currentFood: event.target.value })} value={draft.currentFood} /><CompactChoice checked={draft.currentFoodUnknown} label="I'm not sure" onChange={(checked) => update({ currentFoodUnknown: checked })} /></Field>
      </div></StepSection>
      <StepSection title="Care focus"><Field label="Main concern"><div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">{MAIN_CONCERN_OPTIONS.map((concern) => <OptionButton key={concern} label={concern} onClick={() => update({ mainConcern: concern })} selected={draft.mainConcern === concern} />)}</div>{draft.mainConcern === "Other" ? <input className={`${fieldClass} mt-2`} onChange={(event) => update({ otherConcern: event.target.value })} placeholder="Describe the concern" value={draft.otherConcern} /> : null}</Field></StepSection>
      <StepSection title="Avoid ingredients"><div className="flex flex-wrap gap-2">{avoidIngredientChips.map((ingredient) => <OptionButton key={ingredient} label={ingredient} onClick={() => toggleIngredient(ingredient)} selected={ingredient === "None known" ? draft.avoidIngredientsNoneKnown : draft.avoidIngredients.includes(ingredient)} />)}</div><input className={`${fieldClass} mt-3`} onChange={(event) => update({ avoidIngredientsNoneKnown: false, customAvoidIngredient: event.target.value })} placeholder="Add another ingredient" value={draft.customAvoidIngredient} /></StepSection>
    </div>
  </section>;
}

function ReviewStep({ draft, edit, headingRef, update }: StepProps & { edit: (step: AddPetDraftV2["step"]) => void }) {
  const age = draft.ageUnknown ? "Not sure" : draft.ageValue ? `${draft.ageValue} ${draft.ageUnit}` : "";
  const breed = draft.breedUnknown ? "Not sure" : draft.breed;
  const weight = draft.weightUnknown ? "Not sure" : draft.weightValue ? `${draft.weightValue} ${draft.weightUnit}` : "";
  const food = draft.currentFoodUnknown ? "Not sure" : draft.currentFood;
  const concern = draft.mainConcern === "Other" ? draft.otherConcern || "Other" : draft.mainConcern;
  const ingredients = draft.avoidIngredientsNoneKnown ? "None known" : [...draft.avoidIngredients, draft.customAvoidIngredient].filter(Boolean).join(", ");
  function focusPreferences() { document.querySelector<HTMLInputElement>("#preferences-fields input")?.focus(); }
  return <section aria-labelledby="review-heading">
    <StepHeading draft={draft} heading={`Finish setting up ${normalizeAddPetName(draft.name)}`} headingRef={headingRef} id="review-heading" step={4} />
    <p className="mt-2 text-sm text-[var(--text-secondary)]">Review the essentials. You can add or change optional details later.</p>
    <div className="mt-6 grid gap-4">
      <ReviewGroup edit={() => edit(1)} title="Basic details"><ReviewRows rows={[["Species", title(draft.species || "")], ["Name", normalizeAddPetName(draft.name)], ["Age", age], ["Sex", draft.sex ? title(draft.sex.replace("_", " ")) : ""], ["Breed", breed]]} /></ReviewGroup>
      <ReviewGroup edit={() => edit(2)} title="Care details"><ReviewRows rows={[["Weight", weight], ["Current food", food], ["Main concern", concern], ["Avoid ingredients", ingredients]]} /></ReviewGroup>
      <ReviewGroup edit={focusPreferences} title="Preferences"><div className="grid gap-4" id="preferences-fields"><Field label="Monthly care budget"><div className="flex"><span className="flex items-center rounded-l-[var(--radius-md)] border border-r-0 border-[var(--input-border)] px-4">$</span><input className={`${fieldClass} rounded-l-none`} inputMode="decimal" onChange={(event) => update({ monthlyBudget: event.target.value })} value={draft.monthlyBudget} /></div></Field><Field label="Optional care goal or routine note"><textarea className={`${fieldClass} min-h-20 py-3`} maxLength={500} onChange={(event) => update({ routineNote: event.target.value })} value={draft.routineNote} /></Field></div></ReviewGroup>
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

function StepHeading({ draft, heading, headingRef, id, step }: { draft: AddPetDraftV2; heading: string; headingRef: RefObject<HTMLHeadingElement | null>; id: string; step: number }) {
  return <div className="flex items-center justify-between gap-3"><h1 aria-label={`Step ${step} of 4, ${heading}`} className="min-w-0 text-3xl font-bold tracking-[-0.03em] outline-none sm:text-4xl" id={id} ref={headingRef} tabIndex={-1}>{heading}</h1>{draft.species ? <Image alt={`${title(draft.species)} illustration`} className="h-20 w-20 shrink-0 object-contain" height={80} src={`/images/${draft.species}.png`} width={80} /> : null}</div>;
}

function StepSection({ children, title: sectionTitle }: { children: React.ReactNode; title: string }) { return <section><h2 className="mb-3 text-sm font-semibold text-[var(--text-secondary)]">{sectionTitle}</h2>{children}</section>; }
function Field({ children, label, required = false }: { children: React.ReactNode; label: string; required?: boolean }) { return <div className="grid min-w-0 gap-1.5"><span className="text-sm font-semibold">{label}{required ? <span className="sr-only"> required</span> : null}</span>{children}</div>; }
function CompactChoice({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) { return <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm font-medium"><input checked={checked} className="h-5 w-5 shrink-0" onChange={(event) => onChange(event.target.checked)} type="checkbox" /><span>{label}</span></label>; }
function OptionButton({ label, onClick, selected }: { label: string; onClick: () => void; selected: boolean }) { return <button aria-pressed={selected} className={`min-h-11 min-w-0 rounded-[var(--radius-md)] border px-3 py-2 text-sm font-semibold ${selected ? "border-[var(--border-strong)] bg-[var(--selected-background)]" : "border-[var(--line)] bg-[var(--surface-primary)]"}`} onClick={onClick} type="button">{label}</button>; }
function Progress({ step }: { step: AddPetDraftV2["step"] }) { return <div aria-label={`Step ${step + 1} of 4`} className="flex w-full items-center gap-3"><span className="shrink-0 text-xs font-semibold text-[var(--text-secondary)]">Step {step + 1} of 4</span><div aria-valuemax={4} aria-valuemin={1} aria-valuenow={step + 1} className="grid flex-1 grid-cols-4 gap-1" role="progressbar">{[0, 1, 2, 3].map((index) => <span aria-hidden="true" className={`h-1.5 rounded-full ${index <= step ? "bg-[var(--selection-strong)]" : "bg-[var(--line)]"}`} key={index} />)}</div></div>; }

function SuccessStep({ pet }: { pet: SavedPet }) {
  return <OnboardingShell><section className="mx-auto flex min-h-[calc(100dvh-8.5rem)] max-w-[680px] flex-col items-center justify-center px-1 py-10 text-center" data-ui="add-pet-success"><div aria-hidden="true" className="onboarding-success-mark flex h-14 w-14 items-center justify-center rounded-full bg-[var(--selected-background)] text-2xl text-[var(--deep-forest)]">✓<span className="onboarding-confetti" /></div><Image alt={`${title(pet.species)} illustration`} className="mt-6 h-36 w-36 object-contain sm:h-44 sm:w-44" height={176} src={`/images/${pet.species}.png`} width={176} /><h1 className="mt-6 max-w-xl break-words text-4xl font-bold tracking-[-0.03em] sm:text-5xl">{pet.name}&apos;s Furvise home is ready</h1><p className="mt-4 text-[var(--text-secondary)]">You can add more details whenever they become useful.</p><div className="mt-9 grid w-full max-w-[500px] gap-3"><PrimaryButton href={`/dashboard?pet=${encodeURIComponent(pet.id)}`}>Go to Today</PrimaryButton><SecondaryButton href={`/pets/${encodeURIComponent(pet.id)}`}>View {pet.name}&apos;s profile</SecondaryButton></div></section></OnboardingShell>;
}

function ResumeChoice({ onCancel, onResume, onStartOver }: { onCancel: () => void; onResume: () => void; onStartOver: () => void }) { return <OnboardingShell><section className="mx-auto max-w-[700px] rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface-primary)] p-6 sm:p-8"><h1 className="text-3xl font-bold">Resume pet setup?</h1><p className="mt-3 text-[var(--text-secondary)]">An unfinished setup is saved on this device.</p><div className="mt-7 grid gap-2"><PrimaryButton onClick={onResume} type="button">Resume setup</PrimaryButton><SecondaryButton onClick={onStartOver} type="button">Start over</SecondaryButton><TextButton onClick={onCancel} type="button">Cancel</TextButton></div></section></OnboardingShell>; }

function OnboardingShell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh w-full overflow-x-hidden bg-[var(--surface-page)] text-[var(--text-primary)]" data-ui="quick-start-onboarding-shell"><header className="border-b border-[var(--border-subtle)] bg-[var(--surface-page)]"><div className="mx-auto flex min-h-[4.5rem] w-full max-w-[840px] items-center px-5 sm:px-8"><Link aria-label="Furvise home" href="/"><BrandMark className="onboarding-brand" priority size={34} /></Link></div></header><main className="mx-auto w-full max-w-[840px] px-5 pb-12 pt-10 sm:px-10 sm:pb-12 sm:pt-12">{children}</main></div>;
}

function hasEnteredDetails(draft: AddPetDraftV2) { return Boolean(draft.species || draft.name.trim() || draft.ageValue || draft.breed || draft.weightValue || draft.currentFood || draft.mainConcern || draft.avoidIngredients.length || draft.avoidIngredientsNoneKnown || draft.monthlyBudget || draft.routineNote); }
function title(value: string) { return value ? value[0].toUpperCase() + value.slice(1) : value; }
