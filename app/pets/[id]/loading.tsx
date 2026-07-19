export default function LoadingPetProfile() {
  return (
    <main className="min-h-screen bg-[var(--pw-app-background)] text-[var(--pw-text)]">
      <div className="mx-auto w-full max-w-7xl px-5 pb-16 pt-24 sm:px-8 lg:px-10">
        <div aria-label="Loading pet profile" className="animate-pulse" role="status">
          <div className="h-5 w-28 rounded-full bg-[var(--pw-card-muted)]" />
          <div className="mt-5 h-12 max-w-sm rounded-2xl bg-[var(--pw-card-muted)]" />
          <div className="mt-4 h-6 max-w-xl rounded-2xl bg-[var(--pw-card-muted)]" />
          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                className="min-h-48 rounded-3xl border border-[var(--pw-border)] bg-[var(--pw-surface)] p-5"
                key={index}
              >
                <div className="h-5 w-36 rounded-full bg-[var(--pw-card-muted)]" />
                <div className="mt-5 grid gap-3">
                  <div className="h-4 rounded-full bg-[var(--pw-card-muted)]" />
                  <div className="h-4 w-4/5 rounded-full bg-[var(--pw-card-muted)]" />
                  <div className="h-4 w-2/3 rounded-full bg-[var(--pw-card-muted)]" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
