import { AppPage } from "./app-page";
import { Card, PrimaryButton, SecondaryButton, TextAction, focusedFormLayout } from "./product-primitives";
import type { PetCreationAccess } from "../lib/pet-limit";

export function PetLimitScreen({ access }: { access: PetCreationAccess }) {
  const pet = access.existingPet;
  const petName = pet?.name?.trim() || "your pet";
  const species = pet?.species === "cat" ? "Cat" : pet?.species === "dog" ? "Dog" : "";
  const age = pet?.age_value ? `${pet.age_value} ${pet.age_unit || "years"}` : "";
  const petHref = pet ? `/pets/${encodeURIComponent(pet.id)}` : "/pets";

  return (
    <AppPage layout="focused" shell="reading">
      <section aria-labelledby="pet-limit-title" className={`${focusedFormLayout} pb-8`}>
        <TextAction href="/pets">← Back to Pets</TextAction>
        <p className="mt-6 text-sm font-semibold text-[var(--text-secondary)]">Add a pet</p>
        <h1 className="mt-2 text-3xl font-bold tracking-[-0.03em] text-[var(--text-primary)] sm:text-4xl" id="pet-limit-title">
          Your free plan includes 1 pet
        </h1>
        <p className="mt-3 max-w-xl leading-7 text-[var(--text-secondary)]" role="status">
          You can keep using Furvise for {petName}. Additional pet profiles are available with Furvise Plus.
        </p>

        {pet ? (
          <Card className="mt-6">
            <h2 className="text-xl font-semibold text-[var(--text-primary)]">{petName}</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{[species, age].filter(Boolean).join(" · ")}</p>
            <TextAction className="mt-3" href={petHref}>Open {petName}</TextAction>
          </Card>
        ) : null}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <PrimaryButton href="/pets">Back to pets</PrimaryButton>
          <SecondaryButton href="/account#plans">See plan options</SecondaryButton>
        </div>
      </section>
    </AppPage>
  );
}
