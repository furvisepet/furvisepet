const stepIds = ["about", "everyday", "goals", "review"] as const;

export function OnboardingSteps({ currentIndex, onSelect, petName }: { currentIndex: number; onSelect: (index: number) => void; petName: string }) {
  const labels = [`About ${petName}`, "Everyday care", "Care goals", "Review"];
  return (
    <ol aria-label="Pet setup progress" className="mt-7 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {stepIds.map((id, index) => {
        const state = index < currentIndex ? "completed" : index === currentIndex ? "current" : "upcoming";
        const stateClasses = state === "current"
          ? "border-[var(--border-strong)] bg-[var(--selected-background)] font-semibold text-[var(--text-primary)]"
          : state === "completed"
            ? "border-[var(--border-subtle)] bg-[var(--surface-primary)] font-semibold text-[var(--text-primary)]"
            : "border-[var(--border-subtle)] bg-[var(--surface-primary)] font-medium text-[var(--text-secondary)]";
        const content = <><span aria-hidden="true" className="w-4 shrink-0">{state === "completed" ? "✓" : ""}</span><span>{labels[index]}</span></>;
        return (
          <li className="min-w-0" data-step-state={state} key={id}>
            {state === "completed" ? (
              <button className={`flex min-h-11 w-full items-center rounded-[var(--radius-md)] border px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${stateClasses}`} onClick={() => onSelect(index)} type="button">{content}</button>
            ) : (
              <div aria-current={state === "current" ? "step" : undefined} className={`flex min-h-11 items-center rounded-[var(--radius-md)] border px-3 py-2 text-sm ${stateClasses}`}>{content}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
