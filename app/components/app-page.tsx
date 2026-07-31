import { SignedInHeader } from "./signed-in-header";
import { AppShell, appPageContentClasses, focusedLayout, PageShell, workspaceLayout } from "./product-primitives";

type AppPageContentPreset = keyof typeof appPageContentClasses;

export function AppPage({
  children,
  layout = "workspace",
  shell = "standard",
}: {
  children: React.ReactNode;
  layout?: "focused" | "workspace";
  shell?: AppPageContentPreset;
  width?: "default" | "wide";
}) {
  return (
    <AppShell>
      <SignedInHeader />
      <main className="app-mobile-nav-clearance min-w-0 pt-8 sm:pt-12 lg:pt-14">
        <PageShell preset="app">
          <div className={`${appPageContentClasses[shell]} ${layout === "focused" ? focusedLayout : workspaceLayout}`} data-app-page-content={shell}>{children}</div>
        </PageShell>
      </main>
    </AppShell>
  );
}
