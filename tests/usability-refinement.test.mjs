import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function extractAccountMenuBranches(source) {
  const authenticatedStart = source.indexOf('authState === "authenticated"');
  const anonymousStart = source.indexOf('authState === "anonymous"', authenticatedStart);
  const loadingStart = source.indexOf(": []", anonymousStart);

  return {
    authenticated:
      authenticatedStart >= 0 && anonymousStart > authenticatedStart
        ? source.slice(authenticatedStart, anonymousStart)
        : "",
    anonymous:
      anonymousStart >= 0 && loadingStart > anonymousStart
        ? source.slice(anonymousStart, loadingStart)
        : "",
  };
}

test("appearance is mode-only and persists through the shared storage key", () => {
  const source = read("app/lib/appearance.ts");
  assert.match(source, /THEME_MODE_STORAGE_KEY = "furvise-appearance-mode"/);
  assert.match(source, /LEGACY_THEME_MODE_STORAGE_KEY = "petwise-theme-mode"/);
  assert.match(source, /APPEARANCE_MODE_COOKIE = "furvise-mode"/);
  assert.match(source, /serializeAppearanceCookie\(mode: ThemeMode\)/);
  assert.match(source, /localStorage\.setItem\(THEME_MODE_STORAGE_KEY, mode\)/);
  assert.match(source, /localStorage\.removeItem\(LEGACY_THEME_MODE_STORAGE_KEY\)/);
  assert.match(source, /document\.documentElement\.dataset\.theme = mode/);
  assert.match(source, /document\.body\.dataset\.theme = mode/);
  assert.doesNotMatch(source, /BACKGROUND_OPTIONS|BACKGROUND_STORAGE_KEY|APPEARANCE_BACKGROUND_COOKIE|BackgroundName/);
});

test("appearance modal only exposes light and dark mode", () => {
  const library = read("app/lib/appearance.ts");
  const source = read("app/components/appearance-modal.tsx");
  assert.match(library, /Light/);
  assert.match(library, /Dark/);
  assert.match(source, /MODE_OPTIONS/);
  assert.match(source, /Reset to default/);
  assert.match(source, /Apply/);
  assert.match(source, /Close/);
  assert.doesNotMatch(source, /Background|dog-paws|cat-paws|Minimal/);
});

test("login page exposes forgot password and premium auth surfaces", () => {
  const source = read("app/login/page.tsx");
  assert.match(source, /Forgot password\?/);
  assert.match(source, /href="\/forgot-password"/);
  assert.match(source, /Account access/);
  assert.match(source, /border-\[var\(--pw-border-strong\)\] bg-\[var\(--pw-input\)\]/);
  assert.match(source, /focus:bg-\[var\(--pw-surface-elevated\)\]/);
  assert.match(source, /Keep me signed in/);
});

test("forgot password page renders a reset form and calls the Supabase reset flow", () => {
  const source = read("app/forgot-password/page.tsx");
  assert.match(source, /Reset your password/);
  assert.match(source, /Enter your email and we&apos;ll send you a password reset link\./);
  assert.match(source, /Send reset link/);
  assert.match(source, /Back to sign in/);
  assert.match(source, /resetPasswordForEmail\(email, \{ redirectTo \}\)/);
  assert.match(source, /\/update-password/);
  assert.match(source, /Check your email/);
});

test("update password page prepares the recovery session and updates the password", () => {
  const source = read("app/update-password/page.tsx");
  assert.match(source, /Choose a new password/);
  assert.match(source, /New password/);
  assert.match(source, /Confirm password/);
  assert.match(source, /exchangeCodeForSession\(code\)/);
  assert.match(source, /setSession\(\{/);
  assert.match(source, /updateUser\(\{ password: newPassword \}\)/);
  assert.match(source, /Passwords do not match\./);
  assert.match(source, /Go to dashboard/);
  assert.match(source, /Back to sign in/);
  assert.match(source, /missing or expired/);
});

test("signed-out account menus show sign in and appearance, not account or sign out", () => {
  const homepage = read("app/components/homepage-client.tsx");
  const signedInHeader = read("app/components/signed-in-header.tsx");
  const homepageBranches = extractAccountMenuBranches(homepage);
  const signedInBranches = extractAccountMenuBranches(signedInHeader);
  const homepageAnonymousBranch = homepageBranches.anonymous;
  const signedInAnonymousBranch = signedInBranches.anonymous;
  assert.match(homepageAnonymousBranch, /label: "Sign in"/);
  assert.doesNotMatch(homepageAnonymousBranch, /label: "Account"|label: "Sign out"/);
  assert.match(signedInAnonymousBranch, /label: "Sign in"/);
  assert.doesNotMatch(signedInAnonymousBranch, /label: "Account"|label: "Sign out"/);
  assert.match(homepage, /authState === "anonymous"[\s\S]*label: "Sign in"/);
  assert.match(signedInHeader, /authState === "anonymous"[\s\S]*label: "Sign in"/);
  assert.match(homepage, /authState === "anonymous"[\s\S]*: \[\]/);
  assert.match(signedInHeader, /authState === "anonymous"[\s\S]*: \[\]/);
  assert.doesNotMatch(homepage, /Checking session/);
  assert.doesNotMatch(signedInHeader, /Checking session/);
});

test("signed-in account menus keep account, appearance, and sign out only", () => {
  const source = read("app/components/signed-in-header.tsx");
  const homepage = read("app/components/homepage-client.tsx");
  const accountItems = extractAccountMenuBranches(source).authenticated;
  assert.match(accountItems, /label: "Account"/);
  assert.match(accountItems, /Sign out/);
  assert.doesNotMatch(accountItems, /Sign in|Home|Dashboard|Add pet|Log update|View homepage/);
  assert.match(read("app/components/app-header.tsx"), /renderAccountMenuContents\(menuItems/);
  assert.match(source, /router\.replace\("\/"\)/);
  assert.match(source, /router\.refresh\(\)/);
  assert.match(homepage, /router\.replace\("\/"\)/);
  assert.match(homepage, /router\.refresh\(\)/);
  const signedInSignOutBody = source.slice(source.indexOf("async function signOut"), source.indexOf("const accountMenuItems"));
  const homepageSignOutBody = homepage.slice(homepage.indexOf("async function signOut"), homepage.indexOf("function scrollToSection"));
  assert.doesNotMatch(signedInSignOutBody, /THEME_MODE_STORAGE_KEY|furvise-appearance-mode|localStorage\.removeItem/);
  assert.doesNotMatch(homepageSignOutBody, /THEME_MODE_STORAGE_KEY|furvise-appearance-mode|localStorage\.removeItem/);
});

test("authenticated header uses the shared app navigation contract", () => {
  const source = read("app/components/signed-in-header.tsx");
  assert.match(source, /<AppHeader/);
  assert.match(source, /brandHref="\/"/);
  assert.match(source, /label: "Home"/);
  assert.match(source, /label: "Dashboard"/);
  assert.match(source, /label: "Pets"/);
  assert.match(source, /label: "Care history"/);
  assert.match(source, /label: "Ask Furvise"/);
  assert.doesNotMatch(source, /label: "Today"/);
  assert.doesNotMatch(source, /Care hub/);
  assert.doesNotMatch(source, />\s*Log update\s*</);
  assert.doesNotMatch(source, /data-pet-background|petwise-background|furvise-background/);
});

test("Care history keeps Log update out of top nav and exposes page-level create action", () => {
  const header = read("app/components/signed-in-header.tsx");
  const workspace = read("app/components/care-log-workspace.tsx");
  const form = read("app/components/care-entry-form.tsx");
  const timeline = read("app/components/care-timeline.tsx");
  assert.doesNotMatch(header, />\s*Log update\s*</);
  assert.doesNotMatch(header, /buildLogUpdateHref/);
  assert.match(workspace, /onClick=\{openCreate\}[\s\S]*>\s*Log update\s*<\/button>/);
  assert.match(workspace, /<CareEntryForm/);
  assert.match(workspace, /resolveCareLogInitialPetId/);
  assert.match(workspace, /Add a pet before logging care updates\./);
  assert.match(workspace, /Log the first update/);
  assert.match(workspace, /No updates match these filters\./);
  assert.match(workspace, /Clear filters/);
  assert.match(workspace, /onOpen=\{setViewingEntry\}/);
  assert.match(form, /Furvise could not save this update\. Please try again\./);
  assert.match(form, /if \(submitting\) return/);
  assert.match(form, /disabled=\{submitting\}/);
  assert.doesNotMatch(timeline, /Today|Yesterday|Earlier this week|Older|groupCareEntriesByRecency/);
  assert.match(timeline, /Recent updates/);
  assert.equal((timeline.match(/Recent updates/g) || []).length, 1);
  assert.match(timeline, /sortCareEntriesNewestFirst/);
  assert.match(timeline, /key=\{entry\.id\}/);
  assert.match(timeline, /formatCareEntryTimestamp\(entry\.occurred_at\)/);
});

test("authenticated header switches to compact navigation before tablet labels wrap", () => {
  const header = read("app/components/app-header.tsx");
  const signedIn = read("app/components/signed-in-header.tsx");
  assert.match(header, /lg:flex/);
  assert.match(header, /lg:hidden/);
  assert.match(header, /whitespace-nowrap py-1/);
  assert.match(header, /aria-label="Primary navigation"/);
  assert.match(signedIn, /label: "Care history"/);
  assert.match(signedIn, /label: "Ask Furvise"/);
});

test("homepage header keeps Add pet and Care hub out of top nav and includes Dashboard", () => {
  const source = read("app/components/homepage-client.tsx");
  const headerCall = source.slice(source.indexOf("<AppHeader"), source.indexOf("sticky", source.indexOf("<AppHeader")));
  assert.match(headerCall, /label: "Home"/);
  assert.match(headerCall, /label: "How it works"/);
  assert.match(headerCall, /\{ href: "\/dashboard", label: "Dashboard" \}/);
  assert.doesNotMatch(headerCall, /label: "Add pet"/);
  assert.doesNotMatch(headerCall, /Care hub/);
  assert.match(headerCall, /label: "Sign in"/);
  assert.match(source, /Pet care, connected/);
  assert.match(source, /Set up a pet profile in about 2 minutes\./);
  assert.match(source, /See how Furvise works/);
  assert.match(source, />\s*Add your first pet\s*<\/Link>/);
  assert.match(source, /Go to dashboard/);
});

test("sticky shared header uses a translucent pinned shell", () => {
  const source = read("app/components/app-header.tsx");
  assert.match(source, /sticky top-0 z-50/);
  assert.match(source, /backdrop-blur-xl/);
  assert.match(source, /bg-\[var\(--pw-header-surface\)\]/);
  assert.match(source, /bg-\[var\(--pw-surface-elevated\)\]/);
});

test("homepage uses a wider premium shell with elevated sections", () => {
  const source = read("app/components/homepage-client.tsx");
  assert.match(source, /max-w-\[76rem\]/);
  assert.match(source, /bg-\[var\(--pw-surface-elevated\)\]/);
  assert.match(source, /bg-\[var\(--pw-surface-strong\)\]/);
});

test("dark theme tokens stay neutral charcoal while accents remain green", () => {
  const css = read("app/globals.css");
  const darkBlock = css.slice(css.indexOf('html[data-theme="dark"]'), css.indexOf("@theme inline"));
  assert.match(darkBlock, /--pw-background: #08090b;/);
  assert.match(darkBlock, /--pw-surface: #0f1113;/);
  assert.match(darkBlock, /--pw-surface-elevated: #121416;/);
  assert.match(darkBlock, /--pw-surface-strong: #181c1f;/);
  assert.match(darkBlock, /--pw-card-muted: #141719;/);
  assert.match(darkBlock, /--pw-primary-soft: rgba\(143, 211, 154, 0\.12\);/);
  assert.match(darkBlock, /--pw-border: rgba\(180, 196, 185, 0\.12\);/);
  assert.match(darkBlock, /--pw-border-strong: rgba\(180, 196, 185, 0\.2\);/);
  assert.match(darkBlock, /--pw-hero-card-surface: #0f1113;/);
  assert.match(darkBlock, /--pw-hero-card-panel: #141719;/);
  assert.match(darkBlock, /--pw-hero-card-border: rgba\(180, 196, 185, 0\.16\);/);
  assert.doesNotMatch(darkBlock, /#182020|#1f2a2a|#1d2623|#24312d/);
});

test("shared header active state covers dashboard, pets, care history, and ask", () => {
  const source = read("app/components/app-header.tsx");
  assert.match(source, /item\.href === "\/dashboard"[\s\S]*pathname === "\/dashboard"/);
  assert.match(source, /item\.href === "\/pets"[\s\S]*pathname\.startsWith\("\/pets\/"\)/);
  assert.match(source, /pathname\.startsWith\("\/dogs\/"\)/);
  assert.match(source, /item\.href === "\/care-log"[\s\S]*pathname === "\/care-log"/);
  assert.match(source, /item\.href === "\/ask"[\s\S]*pathname === "\/ask"/);
});

test("shared header keeps a stable account shell and removes loading pills", () => {
  const source = read("app/components/app-header.tsx");
  assert.doesNotMatch(source, /renderLoadingPill|renderAuthLoadingControls|renderCompactLoadingControls/);
  assert.match(source, /aria-haspopup="menu"/);
  assert.match(source, /AccountMenuIcon \/>/);
  assert.match(source, /hasAccountMenuItems \? renderAccountMenuPanel/);
  assert.match(source, /const hasMounted = useSyncExternalStore\(/);
  assert.match(source, /const authResolved = hasMounted && _authState !== "loading"/);
  assert.match(source, /const safeAccountMenuItems = authResolved \? accountMenuItems : \[\]/);
  assert.match(source, /Appearance/);
  assert.doesNotMatch(source, /Background|dog-paws|cat-paws/);
});

test("root layout bootstraps the theme without rendering a raw script tag", () => {
  const layout = read("app/layout.tsx");
  const bootstrap = read("app/components/theme-bootstrap.tsx");
  const appearance = read("app/lib/appearance.ts");
  assert.match(layout, /suppressHydrationWarning/);
  assert.match(layout, /<ThemeBootstrap \/>/);
  assert.doesNotMatch(layout, /<head>|<script|dangerouslySetInnerHTML|themeBootstrapScript/);
  assert.match(bootstrap, /"use client"/);
  assert.match(bootstrap, /useLayoutEffect/);
  assert.match(bootstrap, /readStoredAppearance/);
  assert.match(bootstrap, /syncAppearanceToDocument\(mode\)/);
  assert.match(appearance, /THEME_MODE_STORAGE_KEY = "furvise-appearance-mode"/);
  assert.match(appearance, /document\.documentElement\.dataset\.theme = mode/);
  assert.match(appearance, /document\.documentElement\.style\.colorScheme = mode/);
  assert.match(layout, /data-theme="dark"/);
  assert.doesNotMatch(layout + bootstrap, /data-pet-background|APPEARANCE_BACKGROUND_COOKIE|background picker|furvise-background/);
});

test("account menu items use stable explicit link and button markup", () => {
  const header = read("app/components/app-header.tsx");
  const homepage = read("app/components/homepage-client.tsx");
  const signedInHeader = read("app/components/signed-in-header.tsx");
  const linkBranch = header.slice(header.indexOf('if (item.type === "link")'), header.indexOf("return (", header.indexOf('if (item.type === "link")') + 1));
  assert.match(header, /type HeaderMenuLinkItem = \{[\s\S]*type: "link";[\s\S]*href: string;/);
  assert.match(header, /type HeaderMenuButtonItem = \{[\s\S]*type: "button";[\s\S]*onClick: \(\) => void;/);
  assert.match(header, /if \(item\.type === "link"\)[\s\S]*<Link/);
  assert.match(header, /return \([\s\S]*<button[\s\S]*item\.onClick\(\);/);
  assert.doesNotMatch(linkBranch, /aria-disabled|disabled=\{item\.disabled\}/);
  assert.match(homepage, /type: "link"[\s\S]*label: "Account"/);
  assert.match(homepage, /type: "button"[\s\S]*Sign out/);
  assert.match(signedInHeader, /type: "link" as const[\s\S]*label: "Sign in"/);
});

test("How it works cards use numeric step labels without icons", () => {
  const source = read("app/components/homepage-client.tsx");
  const steps = source.slice(source.indexOf("const howItWorksSteps"), source.indexOf("type AuthState"));
  const cards = source.slice(source.indexOf("{howItWorksSteps.map"), source.indexOf("</section>", source.indexOf("{howItWorksSteps.map")));
  assert.match(source, /Start simple\. Build history over time\./);
  assert.match(steps, /step: "01"/);
  assert.match(steps, /step: "02"/);
  assert.match(steps, /step: "03"/);
  assert.match(steps, /title: "Add each pet"/);
  assert.match(steps, /title: "Log care moments"/);
  assert.match(steps, /title: "Return when you need context"/);
  assert.doesNotMatch(steps, /icon:/);
  assert.doesNotMatch(steps, /PulseIcon|NotebookIcon/);
  assert.doesNotMatch(cards, /compactIconBoxClassName/);
  assert.match(cards, /{step\.step}/);
  assert.doesNotMatch(cards, /<Icon className="block h-4 w-4 shrink-0" \/>/);
  assert.match(source, /text-sm font-semibold uppercase tracking-\[0\.28em\] text-\[var\(--pw-primary\)\]/);
});

test("homepage copy presents a stronger care history story without fake social proof", () => {
  const source = read("app/components/homepage-client.tsx");
  assert.doesNotMatch(source, /Care hub|id="care-hub"|>\s*Trust\s*</);
  assert.doesNotMatch(source, /Add pet|Log update/);
  assert.doesNotMatch(source, /testimonial|user count|users trust|trusted by|featured in|press/i);
  assert.match(source, /Never lose track of your pet&apos;s care again\./);
  assert.match(source, /Maple&apos;s care history/);
  assert.match(source, /Compare today's update with what happened before\./);
  assert.match(source, /TODAY, 6:42 PM/);
  assert.match(source, /YESTERDAY, 8:10 AM/);
  assert.match(source, /MAR 2, 7:30 PM/);
  assert.match(source, /bg-\[var\(--pw-hero-card-panel\)\]/);
  assert.match(source, /bg-\[var\(--pw-hero-card-panel-strong\)\]/);
  assert.match(source, /text-\[var\(--pw-hero-card-heading\)\]/);
  assert.match(source, /Keep symptoms, food notes, grooming, memories, and product feedback connected/);
  assert.match(source, /Remember the little changes/);
  assert.match(source, /See patterns over time/);
  assert.match(source, /Prepare for better vet visits/);
  assert.match(source, /Get product guidance carefully/);
  assert.match(source, /Connected care history/);
  assert.match(source, /From scattered notes to a clearer next step\./);
  assert.match(source, /Furvise keeps your pet&apos;s profile, care updates, saved details, and product feedback connected/);
  assert.match(source, /Profile basics/);
  assert.match(source, /Care updates/);
  assert.match(source, /Saved details/);
  assert.match(source, /Guidance/);
  assert.match(source, /One note becomes useful context\./);
  assert.match(source, /Recent update/);
  assert.match(source, /What Furvise keeps/);
  assert.match(source, /Furvise next step/);
  assert.match(source, /Furvise organizes context\. It does not diagnose\./);
  assert.doesNotMatch(source, /Example Pet History/);
  assert.strictEqual((source.match(/Appetite looked normal after dinner\./g) || []).length, 2);
  assert.match(source, /Built for careful pet care/);
  assert.match(source, /You choose what Furvise remembers\./);
  assert.match(source, /Furvise does not replace a veterinarian\./);
  assert.match(source, /Product guidance appears only when the context fits\./);
  assert.match(source, /For urgent symptoms or medical decisions, contact a veterinarian\./);
  assert.match(source, /Start your pet&apos;s care history today\./);
  assert.match(source, /Your pet family care companion\./);
  assert.match(source, /lg:grid-cols-\[1\.14fr_0\.86fr\]/);
  assert.match(source, /lg:grid-cols-\[0\.9fr_1\.1fr\]/);
  assert.doesNotMatch(source, /PhotoFrame|src="\/images\/|objectFit|object-cover|fallback/i);
});

test("homepage feature and connected care sections use unified divider components", () => {
  const source = read("app/components/homepage-client.tsx");
  assert.match(source, /overflow-hidden rounded-\[1\.75rem\] border border-\[var\(--pw-border\)\] bg-\[var\(--pw-surface-elevated\)\] shadow-\[0_18px_55px_var\(--pw-shadow\)\]/);
  assert.match(source, /grid divide-y divide-\[var\(--pw-border\)\] md:grid-cols-2 md:divide-y-0 md:divide-x xl:grid-cols-4/);
  assert.match(source, /overflow-hidden rounded-\[1\.6rem\] border border-\[var\(--pw-border\)\] bg-\[var\(--pw-surface-strong\)\] shadow-\[0_14px_34px_var\(--pw-shadow\)\]/);
  assert.match(source, /row\.title === connectedCareRows\[0\]\.title \? "" : "border-t border-\[var\(--pw-border\)\]"/);
});

test("homepage hero uses a product card instead of placeholder media", () => {
  const source = read("app/components/homepage-client.tsx");
  assert.match(source, /Maple&apos;s care history/);
  assert.match(source, /Golden retriever - 4 yrs/);
  assert.match(source, /Appetite looked normal after dinner\./);
  assert.match(source, /Groomed - coat and paws checked, no issues\./);
  assert.match(source, /Switched to new food, watching for reaction\./);
  assert.match(source, /Connected/);
  assert.match(source, /TODAY, 6:42 PM/);
  assert.match(source, /YESTERDAY, 8:10 AM/);
  assert.match(source, /MAR 2, 7:30 PM/);
  assert.doesNotMatch(source, /PhotoFrame|hero-family|furvise-maple|object-cover|src="\/images\//i);
});

test("homepage page still renders the homepage client without gating on assets", () => {
  const page = read("app/page.tsx");
  assert.match(page, /<HomepageClient \/>/);
  assert.doesNotMatch(page, /existsSync|availableImages|imageExists|fallback/i);
});

test("onboarding uses shared nav without onboarding actions in the header", () => {
  const onboarding = read("app/onboarding/page.tsx");
  const signedIn = read("app/components/signed-in-header.tsx");
  assert.match(onboarding, /<SignedInHeader \/>/);
  assert.doesNotMatch(signedIn, /label: "Add pet"/);
  assert.doesNotMatch(signedIn, /label: "Log update"/);
});

test("Pets supports a wide single card and responsive multi-pet grid", () => {
  const source = read("app/pets/page.tsx");
  assert.match(source, /profiles\.length === 1 \? "max-w-\[36rem\]"/);
  assert.match(source, /md:grid-cols-2 2xl:grid-cols-3/);
  assert.match(source, /Profile status/);
  assert.match(source, /formatCareEntryTimestamp/);
  assert.doesNotMatch(source, />Open profile<\/Link>/);
});

test("Dashboard pet pill, empty care state, and contextual actions stay focused", () => {
  const source = read("app/dashboard/page.tsx");
  assert.match(source, /entry=\$\{entry\.id\}/);
  assert.doesNotMatch(source, />Open<\/Link>/);
  assert.match(source, /href=\{`\/pets\/\$\{profiles\[0\]\.id\}`\}/);
  assert.match(source, /Choose pets shown on Dashboard/);
  assert.match(source, /Start with one care update/);
  assert.match(source, /No care updates yet\./);
  assert.match(source, /Log the first update/);
  assert.match(source, /Add one useful detail/);
  assert.match(source, /line-clamp-2/);
  assert.match(source, /Next best action/);
  assert.match(source, /Missing:/);
  assert.match(source, /dashboardAction\.missingContext/);
  assert.doesNotMatch(source, /Quick actions|Open pet profile|>\s*Care history\s*<\/Link>|>Full details<\/summary>/);
});

test("Ask Furvise includes structured sections, actions, context, print, confirmation, and one follow-up", () => {
  const page = read("app/ask/page.tsx");
  const route = read("app/api/ask/route.ts");
  const css = read("app/globals.css");
  for (const label of ["Copy", "Save to care history", "Print", "Ask another question"]) {
    assert.match(page, new RegExp(`>${label}<`));
  }
  assert.match(page, /Save to care history\?/);
  assert.match(page, /Save to care history/);
  assert.match(page, /Save this Furvise response as a clearly labeled note/);
  assert.match(page, /One follow-up question/);
  assert.match(page, /followUpUsed/);
  assert.match(page, /ContextSummary/);
  assert.match(page, /window\.print\(\)/);
  assert.match(css, /@media print/);
  assert.match(route, /askResponseJsonSchema/);
  assert.match(route, /repairInstruction/);
  assert.doesNotMatch(page, /whitespace-pre-wrap[^>]*>\{response\}/);
});

test("Ask Furvise saves concise guidance summaries to care history", () => {
  const page = read("app/ask/page.tsx");
  const ask = read("app/lib/ask.mjs");
  const saveCall = page.slice(page.indexOf("async function confirmSave"), page.indexOf("function askAnother"));

  assert.match(page, /buildGuidanceCareEntry/);
  assert.match(saveCall, /const entry = buildGuidanceCareEntry\(guidance, activeSaveMetadata\)/);
  assert.match(saveCall, /createCareEntryUnlessDuplicate/);
  assert.match(saveCall, /This summary is already saved in Care History\./);
  assert.match(saveCall, /category: entry\.category/);
  assert.match(saveCall, /note: entry\.note/);
  assert.match(saveCall, /title: entry\.title/);
  assert.doesNotMatch(saveCall, /title: "Furvise guidance"/);
  assert.match(ask, /Furvise vet prep summary/);
  assert.match(ask, /Furvise recent changes summary/);
  assert.match(ask, /Furvise food notes summary/);
  assert.match(ask, /Furvise symptom notes summary/);
  assert.match(ask, /Furvise log summary/);
  assert.match(ask, /Furvise guidance summary/);
  assert.match(ask, /capCareNote\(/);
});

test("Ask Furvise disables care-history save for non-saveable answers with friendly helper copy", () => {
  const page = read("app/ask/page.tsx");
  const route = read("app/api/ask/route.ts");
  const ask = read("app/lib/ask.mjs");

  assert.match(page, /const saveDisabled = !activeSaveMetadata\?\.saveable/);
  assert.match(page, /Nothing useful to save yet\. Add a care update first, then Ask Furvise can save a better summary\./);
  assert.match(page, /disabled=\{saveDisabled\}/);
  assert.match(route, /saveMetadata: buildAskSaveMetadata/);
  assert.match(ask, /cannotAnswerFromSavedData/);
  assert.match(ask, /usedSavedFactsCount/);
});

test("Care history cards render saved Furvise guidance cleanly without layout changes", () => {
  const timeline = read("app/components/care-timeline.tsx");

  assert.match(timeline, /formatCareEntryCategory\(entry\.category\)/);
  assert.match(timeline, /\{entry\.title \|\| "Update"\}/);
  assert.match(timeline, /formatCareNotePreview\(entry\.note, 150\)/);
  assert.match(timeline, /formatCareEntryTimestamp\(entry\.occurred_at\)/);
  assert.doesNotMatch(timeline, /whitespace-pre-wrap|entry\.note\}/);
});

test("Ask Furvise disables ask controls at the monthly limit and keeps core features available", () => {
  const page = read("app/ask/page.tsx");
  assert.match(page, /const monthlyLimitReached = Boolean\(usage && !usage\.earlyAccessUnlocked && usage\.count >= usage\.limit\)/);
  assert.match(page, /const askSubmitDisabled = submitting \|\| profiles\.length === 0 \|\| monthlyLimitReached/);
  assert.match(page, /disabled=\{askSubmitDisabled\}/);
  assert.match(page, /Monthly limit reached/);
  assert.match(page, /You.ve used your free Ask Furvise messages for this month\. Your care log, dashboard, pet profiles, and curated product suggestions are still available\./);
  assert.match(page, /getAskUsageNotice/);
  assert.match(page, /usage\.remaining > 5/);
  assert.match(page, /You have \$\{usage\.remaining\} Ask Furvise message/);
  assert.doesNotMatch(page, /of \{usage\.limit\} Ask Furvise messages used this month/);
});

test("Save guidance confirmation clearly targets care history, not saved details", () => {
  const page = read("app/ask/page.tsx");
  const modal = page.slice(page.indexOf('id="save-guidance-title"'), page.indexOf("</section>", page.indexOf('id="save-guidance-title"')));
  assert.match(modal, /Save to care history\?/);
  assert.match(modal, /Save this Furvise response as a clearly labeled note/);
  assert.match(modal, /care history/);
  assert.match(modal, />Cancel</);
  assert.match(modal, /"Save note"/);
  assert.doesNotMatch(modal, /saved details/i);
});

test("Saved details empty state explains reusable facts and includes useful next actions", () => {
  const source = read("app/dogs/[id]/memories/page.tsx");
  assert.match(source, /No saved details yet\./);
  assert.match(source, /Saved details are reusable facts and preferences Furvise can remember for future guidance, like avoid ingredients, food notes, routines, or preferences\./);
  assert.match(source, /Care history stores timeline updates\. Saved details store reusable facts Furvise should remember\./);
  assert.match(source, /Back to dashboard/);
  assert.match(source, /Go to Results/);
  assert.match(source, /Continue recommendations/);
  assert.match(source, /\/results\?profileId=\$\{encodeURIComponent\(dogId\)\}/);
  assert.match(source, /if \(source === "ai_suggestion"\) return "Suggested"/);
  assert.doesNotMatch(source, /AI suggestion/);
});

test("Results broad wellness follow-up is actionable and suppresses irrelevant budget warnings", () => {
  const source = read("app/results/page.tsx");
  const shell = read("app/components/app-page.tsx");
  const providerSource = read("app/lib/product-providers.ts");
  for (const label of [
    "Lower cost",
    "Compare current food",
    "Nutrition",
    "Dental care",
    "Grooming",
    "Activity",
    "Preventive care",
    "Reminders",
    "Something else",
    "Ingredient fit",
    "Picky eating",
    "Sensitive stomach",
    "Just exploring",
  ]) {
    assert.match(source, new RegExp(`label: "${label}"`));
  }
  assert.match(source, /What would you like help with first\?/);
  assert.match(source, /Tell Furvise what you want help with\./);
  assert.match(source, /disabled=\{!customReady\}/);
  assert.match(source, /allVisibleProductsOverBudget/);
  assert.match(source, /visibleProductRecommendations\.length > 0/);
  assert.match(source, /Using local care matching right now\./);
  assert.match(source, /Follow-up needed/);
  assert.match(source, /What would you like to improve about .*&apos;s food\?/);
  assert.match(source, /speciesFoodUnavailable/);
  assert.match(source, /safe catalog match/);
  assert.match(source, /No region-verified product suggestion yet/);
  assert.match(source, /Furvise does not have a safe catalog match available for your region right now\./);
  assert.match(source, /Region-verified catalog match/);
  assert.match(source, /getDisplayProductPriceLabel/);
  assert.match(source, /Product price/);
  assert.match(source, /<AppPage>/);
  assert.doesNotMatch(source, /SignedInHeader/);
  assert.match(source, /No lower-cost product matches yet/);
  assert.match(source, /Closest available product options/);
  assert.match(source, /These are catalog comparison options, not a recommendation to switch/);
  assert.match(source, /All visible \{productCopy\.productNoun\} exceed your \$\{budget\}\/month care budget,/);
  assert.match(source, /Over care budget/);
  assert.match(source, /formatProductSpeciesBadge/);
  assert.match(source, /capitalizeSpecies/);
  assert.doesNotMatch(source, /All-pet care item/);
  assert.match(shell, /pt-8/);
  assert.match(source, /Top matches/);
  assert.match(source, /More options/);
  assert.match(source, /Care actions/);
  assert.match(source, /Current food", profile\.currentFoodUnknown \? "I'm not sure"/);
  assert.match(source, /currentFoodUnknown \? "I'm not sure" : profile\.currentFood\.trim\(\) \|\| "Not provided"/);
  assert.match(source, /Curated product/);
  assert.match(source, /Unverified product/);
  assert.match(source, /Static product references are filtered by saved pet context and configured country/);
  assert.match(source, /target=\{productLinkInfo\.target\}/);
  assert.match(source, /rel=\{productLinkInfo\.rel\}/);
  assert.match(source, /item\.product === null/);
  assert.match(providerSource, /View product/);
  assert.match(providerSource, /Product reference/);
  assert.match(providerSource, /staticRealProvider/);
  assert.match(providerSource, /resolveProductProviderMode/);
  assert.match(providerSource, /PRODUCT_PROVIDER/);
  assert.doesNotMatch(source, />\s*Education\s*</);
});

test("Onboarding current food and avoid ingredients remain reversible", () => {
  const source = read("app/onboarding/page.tsx");
  assert.match(source, /const newPetStepKeys = new Set<StepKey>\(\["name", "species", "age", "mainConcern"\]\);/);
  assert.match(source, /getActiveOnboardingSteps\(onboardingMode\)/);
  assert.match(source, /question: "What is your monthly pet care budget\?"/);
  assert.match(source, /helper: "Include food, grooming, care products, and other regular pet essentials\."/);
  assert.match(source, /Monthly care budget/);
  assert.match(source, /readOnly=\{profile\.currentFoodUnknown\}/);
  assert.match(source, /onFocus=\{\(\) => \{/);
  assert.match(source, /beginTextFieldEntry\("currentFood"\)/);
  assert.match(source, /markTextFieldUnknown\("currentFood"\)/);
  assert.match(source, /updateTextFieldValue\("currentFood"/);
  assert.match(source, /isNoneKnown\(value\)/);
  assert.match(source, /avoidIngredients: \[\]/);
  assert.match(source, /None known/);
});

test("finish profile prompts appear after value on Results, Dashboard, and pet profile", () => {
  const results = read("app/results/page.tsx");
  const dashboard = read("app/dashboard/page.tsx");
  const petProfile = read("app/pets/[id]/page.tsx");
  const helper = read("app/lib/finish-profile.ts");

  assert.match(helper, /getFinishProfileItemsFromDraft/);
  assert.match(helper, /getFinishProfileItemsFromRow/);
  assert.match(helper, /label: "Add breed"/);
  assert.match(results, /Furvise has enough to give a first care summary/);
  assert.match(results, /Finish profile/);
  assert.match(dashboard, /profile is started/);
  assert.match(dashboard, /Finish profile/);
  assert.match(petProfile, /profile is started/);
  assert.match(petProfile, /Finish profile/);
});

test("Onboarding saves the profile before navigating to results", () => {
  const onboarding = read("app/onboarding/page.tsx");
  const modeState = read("app/onboarding/mode-state.ts");
  const login = read("app/login/page.tsx");
  const results = read("app/results/page.tsx");
  assert.match(onboarding, /const requestedModeParam = searchParams\.get\("mode"\) \|\| "";/);
  assert.match(onboarding, /authStatus, requestedModeParam, requestedStepParam, router\]/);
  assert.match(onboarding, /resolveOnboardingModeDecision\(\{/);
  assert.match(onboarding, /shouldClearDraftStorage/);
  assert.match(onboarding, /loadDogProfileForUser\(decision\.loadExistingProfileId, user\)/);
  assert.match(onboarding, /setLoadExistingProfileError\(""/);
  assert.match(onboarding, /setSaveProfileError\(""/);
  assert.match(onboarding, /setAnalysisRecommendationError\(""/);
  assert.match(onboarding, /getOnboardingSaveProfileId\(onboardingMode, editingProfileId\)/);
  assert.match(onboarding, /saveProfileErrorMessage = "Furvise could not save this pet profile\. Please try again\.";/);
  assert.match(onboarding, /logProfileSaveFailure\(onboardingMode, saveError\)/);
  assert.match(onboarding, /table: "dog_profiles"/);
  assert.match(onboarding, /const user = await getCurrentUser\(\);/);
  assert.match(onboarding, /if \(!user\) \{/);
  assert.match(onboarding, /saveDogProfileForUser\(profile, user, profileIdForUpdate\)/);
  assert.match(onboarding, /dogProfileRowToDraft\(savedProfile\)/);
  assert.match(onboarding, /savedProfileId/);
  assert.match(onboarding, /if \(!savedProfileId\) \{/);
  assert.match(onboarding, /\/results\?profileId=/);
  assert.doesNotMatch(onboarding, /finally \{\s*setAnalysisLoading\(false\);\s*router\.push\(/s);
  assert.match(onboarding, /router\.push\(buildLoginHref\(NEW_PET_ONBOARDING_PATH\)\)/);
  assert.match(read("app/lib/supabase.ts"), /friendlyDatabaseSaveError\(error, "pet profile"\)/);
  assert.match(read("app/lib/supabase.ts"), /Furvise could not save this \$\{label\}\. Please try again\./);
  assert.match(modeState, /requestedMode: string \| null;/);
  assert.match(modeState, /shouldKeepStoredDraft: boolean;/);
  assert.match(modeState, /shouldRedirectToNewMode: boolean;/);
  assert.match(login, /getSafeNextPath\(searchParams\.get\("next"\) \|\| searchParams\.get\("returnTo"\), "\/dashboard"\)/);
  assert.match(results, /searchParams\.get\("profileId"\) \|\| ""/);
  assert.match(results, /window\.localStorage\.setItem\(PROFILE_ID_STORAGE_KEY, profileIdFromRoute\)/);
});

test("Results keeps safety panels ahead of broad wellness follow-up", () => {
  const source = read("app/results/page.tsx");
  const followUpDefinition = source.slice(source.indexOf("const showWellnessFollowUp"), source.indexOf("const showNutritionFollowUp"));
  const productDefinition = source.slice(source.indexOf("const showProductRecommendations"), source.indexOf("const showWellnessFollowUp"));
  const stableResultDefinition = source.slice(source.indexOf("if ("), source.indexOf("const recommendationTimer"));

  assert.match(productDefinition, /!memoryHasUrgentSafety/);
  assert.match(productDefinition, /!urgentVetAttention/);
  assert.match(followUpDefinition, /!urgentVetAttention/);
  assert.match(followUpDefinition, /!soonVetAttention/);
  assert.match(stableResultDefinition, /memoryHasUrgentSafety/);
  assert.ok(source.indexOf("SoonSafetyPanel") < source.indexOf("WellnessGoalFollowUp"));
  assert.ok(source.indexOf("UrgentCarePanel") < source.indexOf("Top matches"));
});

test("Results stays care-summary focused and avoids diagnostic framing", () => {
  const source = read("app/results/page.tsx");
  const safetyCopy = read("app/lib/safety-copy.ts");

  assert.match(safetyCopy, /Furvise organizes care context\. It does not diagnose or replace a veterinarian\./);
  assert.match(source, /First care summary for/);
  assert.match(source, /What Furvise knows/);
  assert.match(source, /What to log next/);
  assert.match(source, /What to ask the vet/);
  assert.match(source, /buildResultsCareSummary/);
  assert.match(source, /Matches species and care category/);
  assert.match(source, /Add avoid ingredients to make product filtering safer/);
  assert.doesNotMatch(source, /Possible factors/);
  assert.doesNotMatch(source, /Possible causes/);
  assert.doesNotMatch(source, /Furvise analysis/);
  assert.doesNotMatch(source, /Why it fits/);
  assert.doesNotMatch(source, /Why this category fits/);
  assert.doesNotMatch(source, /treatment recommendations/);
});

test("free plan gates only pets and Ask while core loop stays available", () => {
  const askPage = read("app/ask/page.tsx");
  const askRoute = read("app/api/ask/route.ts");
  const onboarding = read("app/onboarding/page.tsx");
  const dashboard = read("app/dashboard/page.tsx");
  const careLog = read("app/components/care-log-workspace.tsx");
  const results = read("app/results/page.tsx");
  const plans = read("app/lib/billing/plan-limits.ts");

  assert.doesNotMatch(askPage, /of \{usage\.limit\} Ask Furvise messages used this month/);
  assert.match(askPage, /AskUsageNotice/);
  assert.match(askPage, /usage\.remaining > 5/);
  assert.match(askRoute, /getAskUsageStatus/);
  assert.match(askRoute, /incrementAskUsage/);
  assert.match(askRoute, /You've used your free Ask Furvise messages for this month/);
  assert.match(askRoute, /getPaidGateMessage/);
  assert.match(plans, /Longer-history pattern detection is planned for Furvise Plus/);
  assert.match(plans, /Exportable vet-prep reports are planned for Furvise Plus/);
  assert.match(plans, /Live product research is planned for Furvise Plus once it is built/);
  assert.match(onboarding, /evaluatePetLimit/);
  assert.match(onboarding, /countDogProfilesForUser/);
  assert.match(onboarding, /Upgrade coming soon/);
  assert.doesNotMatch(dashboard, /evaluateAskUsageLimit|evaluatePetLimit|hardBlocked/);
  assert.doesNotMatch(careLog, /evaluateAskUsageLimit|evaluatePetLimit|hardBlocked/);
  assert.doesNotMatch(results, /evaluateAskUsageLimit|evaluatePetLimit|hardBlocked/);
});

test("mobile pet profile actions are labeled and never render a visible ellipsis button", () => {
  const source = read("app/pets/[id]/page.tsx");
  const petsList = read("app/pets/page.tsx");

  assert.match(source, /aria-label=\{`More actions for \$\{name\}`\}/);
  assert.match(source, />More actions<\/span>/);
  assert.doesNotMatch(source, />\s*\.\.\.\s*</);
  assert.match(petsList, /aria-label=\{`More actions for \$\{name\}`\}/);
  assert.match(petsList, /<svg aria-hidden="true" className="h-5 w-5"/);
  assert.doesNotMatch(petsList, />\s*(?:\.\.\.|•••)\s*</);
});

test("shared mobile header keeps menu and account controls available without desktop nav", () => {
  const header = read("app/components/app-header.tsx");
  const signedInHeader = read("app/components/signed-in-header.tsx");
  const appPage = read("app/components/app-page.tsx");

  assert.match(header, /aria-label=\{mobileMenuOpen \? "Close navigation menu" : "Open navigation menu"\}/);
  assert.match(header, /aria-label=\{mobileAccountMenuOpen \? "Close account menu" : "Open account menu"\}/);
  assert.match(header, /flex shrink-0 items-center gap-1\.5 sm:gap-2 lg:hidden/);
  assert.match(header, /w-full max-w-full min-w-0/);
  assert.match(header, /min-w-0 shrink truncate text-xl/);
  assert.match(signedInHeader, /navItems=\{\[\.\.\.appNavItems\]\}/);
  assert.match(appPage, /overflow-x-hidden/);
  assert.match(appPage, /<SignedInHeader \/>/);
});

test("mobile layout shells and Ask chips avoid horizontal clipping", () => {
  const globals = read("app/globals.css");
  const header = read("app/components/app-header.tsx");
  const appPage = read("app/components/app-page.tsx");
  const homepage = read("app/components/homepage-client.tsx");
  const ask = read("app/ask/page.tsx");
  const login = read("app/login/page.tsx");
  const account = read("app/account/page.tsx");

  assert.match(globals, /max-width: 100vw;/);
  assert.match(globals, /button,\s*input,\s*select,\s*textarea\s*\{\s*max-width: 100%;/);
  assert.match(header, /overflow-x-clip/);
  assert.match(appPage, /w-full max-w-full overflow-x-hidden/);
  assert.match(homepage, /overflow-x-clip px-4/);
  assert.match(ask, /max-w-full overflow-hidden rounded-3xl/);
  assert.match(ask, /max-w-full whitespace-normal break-words rounded-full/);
  assert.match(login, /sm:hidden/);
  assert.match(account, /max-w-2xl overflow-hidden rounded-3xl/);
});

test("onboarding fallback copy does not expose demo or mock language", () => {
  const source = read("app/onboarding/page.tsx");

  assert.match(source, /Furvise used a basic matching path from your saved answers\./);
  assert.doesNotMatch(source, /local demo matching|mock matching|fake|sample matching/);
});

test("results product cards keep mobile scan and tap affordances", () => {
  const source = read("app/results/page.tsx");

  assert.match(source, /grid gap-5 lg:grid-cols-3/);
  assert.match(source, /break-words text-xl font-semibold leading-tight/);
  assert.match(source, /break-words text-lg font-semibold text-\[var\(--pw-primary\)\] sm:text-xl/);
  assert.match(source, /min-h-11 w-full items-center justify-center rounded-full bg-\[var\(--pw-primary\)\]/);
  assert.match(source, /mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap/);
});

test("edit profile mobile form avoids horizontal overflow and keeps bottom actions tappable", () => {
  const source = read("app/dogs/[id]/edit/page.tsx");

  assert.match(source, /min-h-screen overflow-x-hidden/);
  assert.match(source, /mb-24 min-w-0 rounded-\[2rem\]/);
  assert.match(source, /inline-flex min-h-11 max-w-full items-center justify-center rounded-full/);
  assert.match(source, /inline-flex min-h-12 items-center justify-center rounded-full/);
  assert.match(source, /className="min-h-12 rounded-full bg-\[var\(--pw-primary\)\]/);
});
