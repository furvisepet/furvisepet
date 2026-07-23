import { SignedInHeader } from "./signed-in-header";

export function AppPage({
  children,
  width = "default",
}: {
  children: React.ReactNode;
  width?: "default" | "wide";
}) {
  const contentWidth = width === "wide" ? "max-w-[92rem]" : "max-w-7xl";

  return (
    <main className="min-h-screen w-full max-w-full overflow-x-hidden bg-[var(--pw-app-background)] text-[var(--pw-text)]">
      <SignedInHeader />
      <div className={`mx-auto w-full ${contentWidth} min-w-0 px-5 pb-16 pt-8 sm:px-8 lg:px-10`}>{children}</div>
    </main>
  );
}
