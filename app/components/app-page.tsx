import { SignedInHeader } from "./signed-in-header";

export function AppPage({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen w-full max-w-full overflow-x-hidden bg-[var(--pw-app-background)] text-[var(--pw-text)]">
      <SignedInHeader />
      <div className="mx-auto w-full max-w-7xl min-w-0 px-5 pb-16 pt-8 sm:px-8 lg:px-10">{children}</div>
    </main>
  );
}
