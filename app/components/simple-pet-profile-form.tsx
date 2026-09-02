"use client";

import Link from "next/link";
import type { FormEvent, ReactNode } from "react";
import type { DogProfile } from "../lib/petwise";
import { fieldControlClass } from "./product-primitives";

const controlClass = `${fieldControlClass} normal-case tracking-normal`;

export function SimplePetProfileForm({
  cancelHref,
  error,
  onChange,
  onSubmit,
  profile,
  saving,
}: {
  cancelHref: string;
  error: string;
  onChange: (update: Partial<DogProfile>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  profile: DogProfile;
  saving: boolean;
}) {
  return (
    <form className="min-w-0" noValidate onSubmit={onSubmit}>
      {error ? <StatusMessage>{error}</StatusMessage> : null}
      <FormSection label="Basic details">
        <div className="grid min-w-0 gap-x-10 gap-y-7 md:grid-cols-2 lg:gap-x-14 lg:gap-y-8">
          <FormField label="Name">
            <input className={controlClass} name="name" onChange={(event) => onChange({ name: event.target.value })} required value={profile.name} />
          </FormField>

          <div className="grid min-w-0 gap-2 text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-primary)]">
            <span id="pet-species-label">Species</span>
            <div aria-labelledby="pet-species-label" className="grid grid-cols-2 gap-2" role="group">
              {(["dog", "cat"] as const).map((species) => {
                const selected = profile.species === species;
                return (
                  <button
                    aria-pressed={selected}
                    className={`min-h-12 rounded-[var(--radius-sm)] border px-4 text-left text-base font-semibold normal-case tracking-normal transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-page)] ${selected ? "border-[var(--forest)] bg-[var(--pale-sage)] text-[var(--deep-forest)]" : "border-[var(--input-border)] bg-[var(--input-background)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]"}`}
                    key={species}
                    onClick={() => onChange({ species })}
                    type="button"
                  >
                    {species === "dog" ? "Dog" : "Cat"}
                  </button>
                );
              })}
            </div>
          </div>

          <FormField label="Sex">
            <select className={controlClass} name="sex" onChange={(event) => onChange({ sex: event.target.value as DogProfile["sex"] })} value={profile.sex || ""}>
              <option value="">Select sex</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="not_sure">Not sure</option>
            </select>
          </FormField>

          <FormField label="Age">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(7.5rem,0.48fr)] gap-2">
              <input className={controlClass} inputMode="decimal" min="0" name="age" onChange={(event) => onChange({ age: event.target.value, ageUnknown: !event.target.value })} placeholder="2" step="any" type="number" value={profile.age} />
              <select aria-label="Age unit" className={controlClass} name="ageUnit" onChange={(event) => onChange({ ageUnit: event.target.value as DogProfile["ageUnit"] })} value={profile.ageUnit}>
                <option value="years">years</option>
                <option value="months">months</option>
              </select>
            </div>
          </FormField>

          <FormField label="Breed">
            <input className={controlClass} name="breed" onChange={(event) => onChange({ breed: event.target.value })} placeholder="Breed, if you know it" value={profile.breed} />
          </FormField>

          <FormField label="Weight">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(7.5rem,0.48fr)] gap-2">
              <input className={controlClass} inputMode="decimal" min="0" name="weight" onChange={(event) => onChange({ weight: event.target.value, weightUnknown: !event.target.value })} placeholder="42" step="any" type="number" value={profile.weight} />
              <select aria-label="Weight unit" className={controlClass} name="weightUnit" onChange={(event) => onChange({ weightUnit: event.target.value as DogProfile["weightUnit"] })} value={profile.weightUnit}>
                <option value="lb">lb</option>
                <option value="kg">kg</option>
              </select>
            </div>
          </FormField>
        </div>
      </FormSection>

      <FormSection className="mt-12 sm:mt-14 lg:mt-16" label="Care context">
        <div className="grid min-w-0 gap-7 sm:gap-8">
          <FormField label="Current food">
            <input className={controlClass} name="currentFood" onChange={(event) => onChange({ currentFood: event.target.value, currentFoodUnknown: !event.target.value })} placeholder="What are they eating now?" value={profile.currentFood} />
          </FormField>

          <FormField label="Anything else Furvise should know?">
            <textarea className={`${controlClass} min-h-32 resize-y py-3 leading-7`} maxLength={2000} name="routineNote" onChange={(event) => onChange({ routineNote: event.target.value })} placeholder="Routine, habits, or useful context..." value={profile.routineNote || ""} />
          </FormField>
        </div>
      </FormSection>

      <div className="mt-10 flex flex-col gap-2 border-t border-[var(--line)] pt-6 sm:mt-12 sm:flex-row-reverse sm:items-center sm:justify-between">
        <button
          className="inline-flex min-h-12 w-full items-center justify-center rounded-[var(--radius-sm)] bg-[var(--deep-forest)] px-6 text-sm font-semibold text-[color:var(--warm-cream)] transition-colors hover:bg-[var(--forest)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-page)] disabled:cursor-wait disabled:bg-[var(--disabled-surface)] disabled:text-[var(--disabled-text)] sm:w-auto"
          disabled={saving}
          type="submit"
        >
          {saving ? "SAVING..." : "SAVE CHANGES"}
        </button>
        <Link className="inline-flex min-h-11 items-center px-1 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-page)]" href={cancelHref}>Cancel</Link>
      </div>
    </form>
  );
}

function FormField({ children, label }: { children: ReactNode; label: string }) {
  return <label className="grid min-w-0 gap-2 text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-primary)]"><span>{label}</span>{children}</label>;
}

function FormSection({ children, className = "", label }: { children: ReactNode; className?: string; label: string }) {
  return (
    <section aria-labelledby={`edit-pet-${label.replace(" ", "-")}`} className={className}>
      <div className="mb-7 flex items-center gap-4 sm:mb-8">
        <h2 className="shrink-0 text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-primary)]" id={`edit-pet-${label.replace(" ", "-")}`}>{label}</h2>
        <span aria-hidden="true" className="h-px flex-1 bg-[var(--line)]" />
      </div>
      {children}
    </section>
  );
}

function StatusMessage({ children }: { children: ReactNode }) {
  return <p className="mb-6 border-y border-[var(--danger-text)] py-3 text-sm leading-6 text-[var(--danger-text)]" role="alert">{children}</p>;
}
