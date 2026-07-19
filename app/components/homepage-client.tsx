"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ComponentType } from "react";
import { AppHeader } from "./app-header";
import { ANALYSIS_STORAGE_KEY } from "../lib/ai-analysis";
import { NEW_PET_LOGIN_PATH, NEW_PET_ONBOARDING_PATH } from "../lib/auth-routing";
import { ONBOARDING_MODE_STORAGE_KEY, STORAGE_KEY } from "../lib/petwise";
import {
  PROFILE_ID_STORAGE_KEY,
  PROFILE_MEMORIES_STORAGE_KEY,
  getBrowserSupabase,
  getSupabaseConfigError,
  setBrowserSupabasePersistence,
} from "../lib/supabase";

const compactIconBoxClassName =
  "inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[color-mix(in_srgb,var(--pw-primary)_22%,var(--pw-border))] bg-[color-mix(in_srgb,var(--pw-primary)_12%,transparent)] text-[var(--pw-primary)]";

const sectionShellClassName =
  "mx-auto w-full max-w-[76rem] overflow-x-clip px-4 sm:px-8 lg:px-8";

type FeatureCard = {
  icon: ComponentType<{ className?: string }>;
  title: string;
  copy: string;
};

const featureCards: readonly FeatureCard[] = [
  {
    icon: PawIcon,
    title: "Remember the little changes",
    copy: "Appetite, energy, grooming, symptoms, and routines stay in one place.",
  },
  {
    icon: SparkIcon,
    title: "See patterns over time",
    copy: "Compare today's update with what happened before.",
  },
  {
    icon: ShieldIcon,
    title: "Prepare for better vet visits",
    copy: "Bring a clearer history instead of trying to remember everything.",
  },
  {
    icon: ClockIcon,
    title: "Get product guidance carefully",
    copy: "Products appear only when they fit the pet context.",
  },
] as const;

const connectedCareRows = [
  {
    icon: PawIcon,
    title: "Profile basics",
    copy: "Species, age, food, budget, and care concerns.",
  },
  {
    icon: SparkIcon,
    title: "Care updates",
    copy: "Log appetite, symptoms, grooming, activity, and behavior.",
  },
  {
    icon: ClockIcon,
    title: "Saved details",
    copy: "Keep preferences and patterns worth remembering.",
  },
  {
    icon: ShieldIcon,
    title: "Guidance",
    copy: "Get practical next steps based on what Furvise knows.",
  },
] as const;

const safetyStatements = [
  "You choose what Furvise remembers.",
  "Furvise does not replace a veterinarian.",
  "Product guidance appears only when the context fits.",
] as const;

const heroTimeline = [
  {
    timestamp: "TODAY, 6:42 PM",
    badge: "Appetite",
    copy: "Appetite looked normal after dinner.",
  },
  {
    timestamp: "YESTERDAY, 8:10 AM",
    badge: "Grooming",
    copy: "Groomed - coat and paws checked, no issues.",
  },
  {
    timestamp: "MAR 2, 7:30 PM",
    badge: "Food",
    copy: "Switched to new food, watching for reaction.",
  },
] as const;

const howItWorksSteps = [
  {
    step: "01",
    title: "Add each pet",
    copy: "Save the basics once.",
  },
  {
    step: "02",
    title: "Log care moments",
    copy: "Capture symptoms, routines, food, grooming, and memories.",
  },
  {
    step: "03",
    title: "Return when you need context",
    copy: "Use the same history for guidance, vet prep, and product decisions.",
  },
] as const;

type AuthState = "loading" | "anonymous" | "authenticated";

export function HomepageClient() {
  const router = useRouter();
  const configError = getSupabaseConfigError();
  const [authState, setAuthState] = useState<AuthState>(() => {
    if (configError) {
      return "anonymous";
    }

    return getBrowserSupabase() ? "loading" : "anonymous";
  });
  const [activeSection, setActiveSection] = useState("home");
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const client = getBrowserSupabase();

    if (!client) {
      return;
    }

    let mounted = true;

    client.auth
      .getUser()
      .then(({ data }) => {
        if (!mounted) return;
        setAuthState(data.user ? "authenticated" : "anonymous");
      })
      .catch(() => {
        if (mounted) {
          setAuthState("anonymous");
        }
      });

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      setAuthState(session?.user ? "authenticated" : "anonymous");
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const sectionIds = ["home", "how-it-works"];
    const sections = sectionIds
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => element !== null);

    if (sections.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntries = entries.filter((entry) => entry.isIntersecting);

        if (visibleEntries.length === 0) {
          return;
        }

        const winner = visibleEntries.reduce((current, candidate) =>
          candidate.intersectionRatio > current.intersectionRatio ? candidate : current,
        );

        setActiveSection(winner.target.id);
      },
      {
        rootMargin: "-34% 0px -50% 0px",
        threshold: [0.15, 0.3, 0.5, 0.75],
      },
    );

    sections.forEach((section) => observer.observe(section));

    return () => observer.disconnect();
  }, []);

  function startNewPet() {
    if (authState !== "authenticated") {
      return;
    }

    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(PROFILE_ID_STORAGE_KEY);
    window.localStorage.removeItem(PROFILE_MEMORIES_STORAGE_KEY);
    window.localStorage.removeItem(ANALYSIS_STORAGE_KEY);
    window.localStorage.setItem(ONBOARDING_MODE_STORAGE_KEY, "new");
  }

  async function signOut() {
    const client = getBrowserSupabase();
    if (!client || signingOut) return;

    setSigningOut(true);

    try {
      const { error: signOutError } = await client.auth.signOut();

      if (signOutError) {
        throw signOutError;
      }

      setBrowserSupabasePersistence(null);
      setAuthState("anonymous");
      router.replace("/");
      router.refresh();
    } catch {
      setSigningOut(false);
      return;
    }

    setSigningOut(false);
  }

  function scrollToSection(sectionId: string) {
    document.getElementById(sectionId)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  const addPetHref = authState === "authenticated" ? NEW_PET_ONBOARDING_PATH : NEW_PET_LOGIN_PATH;

  return (
    <main className="min-h-screen overflow-x-clip bg-transparent text-[var(--pw-text)]">
      <AppHeader
        authState={authState}
        homepagePolish
        variant="homepage"
        brandMark={<BrandMark />}
        brandHref="/"
        navItems={[
          { active: activeSection === "home", href: "#home", label: "Home" },
          { active: activeSection === "how-it-works", href: "#how-it-works", label: "How it works" },
          { href: "/dashboard", label: "Dashboard" },
        ]}
        accountMenuItems={
          authState === "authenticated"
            ? [
                {
                  type: "link",
                  href: "/account",
                  label: "Account",
                },
                {
                  type: "button",
                  disabled: signingOut,
                  label: signingOut ? "Signing out..." : "Sign out",
                  onClick: signOut,
                  tone: "danger",
                },
              ]
            : authState === "anonymous"
            ? [
                {
                  type: "link",
                  href: "/login",
                  label: "Sign in",
                },
              ]
            : []
        }
        sticky
      />

      <section
        className={`${sectionShellClassName} relative scroll-mt-28 pb-16 pt-10 sm:pb-[4.5rem] sm:pt-14 lg:pb-[5.5rem] lg:pt-16`}
        id="home"
      >
        <div className="grid min-w-0 gap-10 lg:grid-cols-[1.14fr_0.86fr] lg:items-center lg:gap-14">
          <div className="min-w-0 max-w-[48rem]">
            <p className="inline-flex max-w-full rounded-full border border-[var(--pw-border)] bg-[var(--pw-surface-elevated)] px-3 py-1 text-xs font-semibold tracking-[0.18em] text-[var(--pw-primary)] shadow-sm sm:text-sm sm:tracking-[0.24em]">
              Pet care, connected
            </p>
            <h1 className="mt-6 max-w-full break-words text-3xl font-semibold leading-[1.08] tracking-tight text-[var(--pw-heading)] sm:text-5xl lg:text-[4.65rem] lg:leading-[0.97]">
              Never lose track of your pet&apos;s care again.
            </h1>
            <p className="mt-6 max-w-[40rem] break-words text-base leading-8 text-[var(--pw-muted)] sm:text-xl sm:leading-9 lg:text-[1.18rem]">
              Keep symptoms, food notes, grooming, memories, and product feedback connected for every pet you love.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
              <Link
                className="inline-flex min-h-[3.25rem] w-full max-w-full items-center justify-center rounded-full bg-[var(--pw-primary)] px-6 py-4 text-base font-semibold text-white shadow-[0_18px_52px_var(--pw-shadow)] transition hover:bg-[var(--pw-primary-hover)] sm:w-auto sm:px-9 sm:text-lg"
                href={addPetHref}
                onClick={startNewPet}
              >
                Add your first pet
              </Link>
              <button
                className="inline-flex min-h-[3.25rem] w-full max-w-full items-center justify-center rounded-full border border-[var(--pw-border-strong)] bg-[var(--pw-surface-strong)] px-5 py-3.5 text-base font-semibold text-[var(--pw-text)] shadow-sm transition hover:border-[var(--pw-secondary)] hover:text-[var(--pw-primary)] sm:w-auto sm:px-7"
                type="button"
                onClick={() => scrollToSection("how-it-works")}
              >
                See how Furvise works
              </button>
            </div>
            <p className="mt-5 max-w-xl text-base leading-7 text-[var(--pw-subtle)]">
              Set up a pet profile in about 2 minutes.
            </p>
          </div>

          <div className="relative mx-auto min-w-0 w-full max-w-[44rem] lg:ml-auto">
            <div className="absolute right-6 top-10 -z-10 h-[22rem] w-[22rem] rounded-full bg-[radial-gradient(circle,rgba(148,211,155,0.16)_0,rgba(148,211,155,0.06)_28%,transparent_70%)] blur-3xl" />
            <div className="relative overflow-hidden rounded-[2rem] border border-[var(--pw-border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--pw-surface)_98%,transparent),color-mix(in_srgb,var(--pw-card-muted)_72%,var(--pw-surface)))] p-4 shadow-[0_36px_120px_var(--pw-shadow)] sm:p-5">
              <div className="rounded-[1.7rem] border border-[var(--pw-border)] bg-[linear-gradient(180deg,var(--pw-hero-card-surface),var(--pw-hero-card-surface-strong))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-6">
                <div className="flex min-w-0 items-start justify-between gap-3 sm:gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-[color-mix(in_srgb,var(--pw-primary)_70%,white)]" />
                      <span className="h-2 w-2 rounded-full bg-[var(--pw-hero-card-dot)]" />
                      <span className="h-2 w-2 rounded-full bg-[var(--pw-hero-card-dot)]" />
                    </div>
                    <p className="mt-5 break-words text-xs font-semibold uppercase tracking-[0.16em] text-[var(--pw-hero-card-accent)] sm:text-sm sm:tracking-[0.2em]">
                      Maple&apos;s care history
                    </p>
                    <div className="mt-3 flex min-w-0 items-center gap-3">
                      <div className="flex h-[3.25rem] w-[3.25rem] shrink-0 items-center justify-center rounded-2xl border border-[var(--pw-hero-card-border)] bg-[var(--pw-hero-card-accent-soft)] text-lg font-semibold text-[var(--pw-hero-card-heading)]">
                        M
                      </div>
                      <div className="min-w-0">
                        <p className="text-[1.05rem] font-semibold tracking-tight text-[var(--pw-hero-card-heading)] sm:text-[1.15rem]">
                          Maple
                        </p>
                        <p className="break-words text-sm text-[var(--pw-hero-card-muted)] sm:text-[0.98rem]">
                          Golden retriever - 4 yrs
                        </p>
                      </div>
                    </div>
                  </div>
                  <span className="hidden rounded-full border border-[var(--pw-hero-card-border)] bg-[var(--pw-hero-card-accent-soft)] px-3 py-1 text-xs font-semibold tracking-[0.18em] text-[var(--pw-hero-card-accent)] sm:inline-flex">
                    Connected
                  </span>
                </div>

                <div className="relative mt-6 rounded-[1.5rem] border border-[var(--pw-hero-card-border)] bg-[var(--pw-hero-card-panel)] p-4 shadow-[0_16px_36px_var(--pw-shadow)] sm:p-6">
                  <div className="absolute bottom-6 left-7 top-11 w-px bg-[linear-gradient(180deg,transparent,rgba(188,229,194,0.42),transparent)]" />
                  <div className="grid gap-5">
                    {heroTimeline.map((entry) => (
                      <article className="relative pl-10" key={entry.timestamp}>
                        <span className="absolute left-[0.35rem] top-2 h-3 w-3 rounded-full border border-[color-mix(in_srgb,var(--pw-hero-card-accent)_42%,transparent)] bg-[var(--pw-primary)] shadow-[0_0_0_6px_color-mix(in_srgb,var(--pw-primary)_14%,transparent)]" />
                        <p className="break-words text-xs font-semibold uppercase tracking-[0.14em] text-[var(--pw-hero-card-subtle)] sm:tracking-[0.22em]">
                          {entry.timestamp}
                        </p>
                        <p className="mt-2 text-[1.04rem] leading-7 text-[var(--pw-hero-card-heading)] sm:text-[1.06rem]">
                          {entry.copy}
                        </p>
                        <span className="mt-3 inline-flex rounded-full border border-[var(--pw-hero-card-border)] bg-[var(--pw-hero-card-panel-strong)] px-3 py-1 text-xs font-semibold text-[var(--pw-hero-card-accent)] shadow-[0_8px_18px_rgba(0,0,0,0.18)]">
                          {entry.badge}
                        </span>
                      </article>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={`${sectionShellClassName} pb-12 sm:pb-14`}>
        <div className="overflow-hidden rounded-[1.75rem] border border-[var(--pw-border)] bg-[var(--pw-surface-elevated)] shadow-[0_18px_55px_var(--pw-shadow)]">
          <div className="grid divide-y divide-[var(--pw-border)] md:grid-cols-2 md:divide-y-0 md:divide-x xl:grid-cols-4">
          {featureCards.map((card) => {
            const Icon = card.icon;

            return (
              <article
                className="flex min-h-[14.5rem] flex-col bg-[color-mix(in_srgb,var(--pw-surface-elevated)_96%,var(--pw-surface))] p-7 sm:p-8"
                key={card.title}
              >
                <span className={compactIconBoxClassName}>
                  <Icon className="block h-4 w-4 shrink-0" />
                </span>
                <h2 className="mt-6 text-[1.3rem] font-semibold leading-7 tracking-tight text-[var(--pw-heading)]">
                  {card.title}
                </h2>
                <p className="mt-3 text-[1.02rem] leading-7 text-[var(--pw-muted)]">{card.copy}</p>
              </article>
            );
          })}
          </div>
        </div>
      </section>

      <section className={`${sectionShellClassName} pb-12 pt-2 sm:pb-14`}>
        <div className="grid gap-6 rounded-[2rem] border border-[var(--pw-border)] bg-[var(--pw-surface-elevated)] p-6 shadow-[0_18px_55px_var(--pw-shadow)] sm:p-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start lg:p-10">
          <div className="max-w-xl lg:pt-1">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--pw-primary)]">
              Connected care history
            </p>
            <h2 className="mt-4 text-3xl font-semibold leading-[1.08] tracking-tight text-[var(--pw-heading)] sm:text-4xl lg:text-[3.1rem]">
              From scattered notes to a clearer next step.
            </h2>
            <p className="mt-5 max-w-[36rem] text-[1.04rem] leading-8 text-[var(--pw-muted)] sm:text-lg">
              Furvise keeps your pet&apos;s profile, care updates, saved details, and product feedback connected so each
              new change has context.
            </p>
          </div>

          <div className="overflow-hidden rounded-[1.6rem] border border-[var(--pw-border)] bg-[var(--pw-surface-strong)] shadow-[0_14px_34px_var(--pw-shadow)]">
            {connectedCareRows.map((row) => {
              const Icon = row.icon;

              return (
                <div
                  className={`grid grid-cols-[2.75rem_minmax(0,1fr)] items-start gap-x-4 px-5 py-4.5 sm:grid-cols-[3rem_minmax(0,1fr)] sm:px-6 sm:py-5 ${
                    row.title === connectedCareRows[0].title ? "" : "border-t border-[var(--pw-border)]"
                  }`}
                  key={row.title}
                >
                  <span className={compactIconBoxClassName}>
                    <Icon className="block h-4 w-4 shrink-0" />
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <p className="text-lg font-semibold leading-7 text-[var(--pw-heading)]">{row.title}</p>
                    <p className="mt-1.5 text-[1rem] leading-7 text-[var(--pw-muted)]">{row.copy}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className={`${sectionShellClassName} pb-12 pt-2 sm:pb-14`}>
        <div className="overflow-hidden rounded-[2rem] border border-[var(--pw-border)] bg-[var(--pw-surface-elevated)] shadow-[0_18px_55px_var(--pw-shadow)]">
          <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
            <div className="p-6 sm:p-8 lg:p-10">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--pw-primary)]">Example</p>
              <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-[var(--pw-heading)] sm:text-4xl">
                One note becomes useful context.
              </h2>
              <p className="mt-4 text-[1.03rem] leading-8 text-[var(--pw-muted)] sm:text-lg">
                See how a simple care update becomes part of the bigger pet history.
              </p>
            </div>

            <div className="border-t border-[var(--pw-border)] p-6 sm:p-8 lg:border-l lg:border-t-0 lg:p-10">
              <div className="rounded-[1.5rem] border border-[var(--pw-border)] bg-[var(--pw-surface-strong)] p-5 shadow-[0_18px_44px_var(--pw-shadow)] sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--pw-primary)]">
                      Example
                    </p>
                    <p className="mt-2 text-lg font-semibold text-[var(--pw-heading)]">Maple</p>
                  </div>
                  <span className="rounded-full border border-[color-mix(in_srgb,var(--pw-primary)_26%,transparent)] bg-[color-mix(in_srgb,var(--pw-primary)_10%,transparent)] px-3 py-1 text-xs font-semibold text-[var(--pw-primary)]">
                    One history
                  </span>
                </div>

                <div className="mt-5 grid gap-3.5">
                  <div className="rounded-[1.2rem] border border-[var(--pw-border)] bg-[var(--pw-surface-elevated)] p-[1.125rem] shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--pw-subtle)]">
                      Recent update
                    </p>
                    <p className="mt-2 text-[1.02rem] leading-7 text-[var(--pw-heading)]">
                      Appetite looked normal after dinner.
                    </p>
                  </div>
                  <div className="rounded-[1.2rem] border border-[var(--pw-border)] bg-[var(--pw-surface-elevated)] p-[1.125rem] shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--pw-subtle)]">
                      What Furvise keeps
                    </p>
                    <p className="mt-2 text-[1.02rem] leading-7 text-[var(--pw-heading)]">
                      Linked to Maple&apos;s profile, recent activity, and saved food notes.
                    </p>
                  </div>
                  <div className="rounded-[1.2rem] border border-[color-mix(in_srgb,var(--pw-primary)_28%,transparent)] bg-[color-mix(in_srgb,var(--pw-primary)_13%,var(--pw-surface-strong))] p-[1.125rem] shadow-[0_12px_26px_var(--pw-shadow)]">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--pw-primary)]">
                      Furvise next step
                    </p>
                    <p className="mt-2 text-[1.02rem] leading-7 text-[var(--pw-heading)]">
                      If appetite changes again tomorrow, log it and compare with recent activity.
                    </p>
                  </div>
                </div>

                <p className="mt-4 px-1 pt-1 text-sm font-medium leading-7 text-[var(--pw-subtle)]">
                  Furvise organizes context. It does not diagnose.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        className={`${sectionShellClassName} scroll-mt-28 pb-12 pt-2 sm:pb-14`}
        id="how-it-works"
      >
        <div className="rounded-[2rem] border border-[var(--pw-border)] bg-[var(--pw-surface-elevated)] p-6 shadow-[0_18px_55px_var(--pw-shadow)] sm:p-8 lg:p-10">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--pw-primary)]">How it works</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--pw-heading)] sm:text-4xl">
              Start simple. Build history over time.
            </h2>
          </div>

          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {howItWorksSteps.map((step) => (
              <article
                className="rounded-[1.35rem] border border-[var(--pw-border)] bg-[var(--pw-surface-strong)] p-6 shadow-[0_12px_32px_var(--pw-shadow)] sm:p-7"
                key={step.title}
              >
                <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--pw-primary)]">
                  {step.step}
                </p>
                <h3 className="mt-5 text-[1.25rem] font-semibold leading-8 text-[var(--pw-heading)]">{step.title}</h3>
                <p className="mt-3 text-[1rem] leading-7 text-[var(--pw-muted)]">{step.copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={`${sectionShellClassName} pb-12 pt-2 sm:pb-14`} id="safety">
        <div className="rounded-[2rem] border border-[var(--pw-border)] bg-[var(--pw-surface-elevated)] p-6 shadow-[0_18px_55px_var(--pw-shadow)] sm:p-8 lg:p-10">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--pw-primary)]">
            Built for careful pet care
          </p>
          <div className="mt-6 grid gap-5 md:grid-cols-3">
            {safetyStatements.map((statement) => (
              <div
                className="rounded-[1.35rem] border border-[var(--pw-border)] bg-[var(--pw-surface-strong)] p-5 shadow-[0_10px_28px_var(--pw-shadow)] sm:p-6"
                key={statement}
              >
                <p className="text-[1.03rem] font-semibold leading-8 text-[var(--pw-heading)] sm:text-[1.08rem]">
                  {statement}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-6 max-w-3xl text-[1.03rem] leading-8 text-[var(--pw-muted)]">
            For urgent symptoms or medical decisions, contact a veterinarian.
          </p>
        </div>
      </section>

      <section className={`${sectionShellClassName} pb-14 pt-2 sm:pb-16`}>
        <div className="rounded-[2rem] border border-[var(--pw-border-strong)] bg-[linear-gradient(180deg,var(--pw-surface-elevated),var(--pw-surface-strong))] p-7 shadow-[0_22px_68px_var(--pw-shadow)] sm:p-9 lg:flex lg:items-center lg:justify-between lg:gap-10 lg:p-10">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight text-[var(--pw-heading)] sm:text-4xl">
              Start your pet&apos;s care history today.
            </h2>
            <p className="mt-3 text-lg leading-8 text-[var(--pw-muted)]">
              Add one pet now. Furvise will keep the details connected as life changes.
            </p>
          </div>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:gap-4 lg:mt-0 lg:shrink-0">
            <Link
              className="inline-flex min-h-[3.25rem] w-full items-center justify-center rounded-full bg-[var(--pw-primary)] px-8 py-4 text-base font-semibold text-white shadow-[0_18px_52px_var(--pw-shadow)] transition hover:bg-[var(--pw-primary-hover)] sm:w-auto"
              href={addPetHref}
              onClick={startNewPet}
            >
              Add your first pet
            </Link>
            <Link
              className="inline-flex min-h-[3.25rem] w-full items-center justify-center rounded-full border border-[var(--pw-border-strong)] bg-[var(--pw-surface-strong)] px-7 py-4 text-base font-semibold text-[var(--pw-text)] shadow-sm transition hover:border-[var(--pw-secondary)] hover:text-[var(--pw-primary)] sm:w-auto"
              href="/dashboard"
            >
              Go to dashboard
            </Link>
          </div>
        </div>
      </section>

      <footer className={`${sectionShellClassName} pb-10 pt-2 sm:pb-12 lg:pb-16`}>
        <div className="rounded-[2rem] border border-[var(--pw-border)] bg-[var(--pw-surface-elevated)] px-6 py-10 shadow-[0_18px_55px_var(--pw-shadow)] sm:px-8 sm:py-12 lg:px-10 lg:py-14">
          <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-md">
              <div className="flex items-center gap-3">
                <BrandMark />
                <p className="text-2xl font-semibold tracking-tight text-[var(--pw-heading)]">Furvise</p>
              </div>
              <p className="mt-5 text-lg leading-8 text-[var(--pw-muted)]">Your pet family care companion.</p>
            </div>

            <div className="grid gap-10 sm:grid-cols-2 sm:gap-x-12 lg:grid-cols-3 lg:gap-x-14">
              <FooterNavGroup
                title="Explore"
                items={[
                  { href: "#home", label: "Home" },
                  { href: "#how-it-works", label: "How it works" },
                  { href: "/dashboard", label: "Dashboard" },
                ]}
                onSectionClick={scrollToSection}
              />
              <FooterNavGroup
                title="Company"
                items={[
                  { href: "/privacy", label: "Privacy" },
                  { label: "Terms", disabled: true },
                  { label: "Contact", disabled: true },
                ]}
              />
            </div>
          </div>

          <div className="mt-10 flex flex-col gap-4 border-t border-[var(--pw-border)] pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[1.02rem] leading-7 text-[var(--pw-subtle)]">&copy; 2026 Furvise</p>
          </div>
        </div>
      </footer>
    </main>
  );
}

function BrandMark() {
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-[var(--pw-border)] bg-[var(--pw-surface-strong)] shadow-sm">
      <div className="relative h-4 w-4 rounded-full bg-[var(--pw-primary)]">
        <span className="absolute -left-1 -top-1 h-1.5 w-1.5 rounded-full bg-[var(--pw-primary)]" />
        <span className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-[var(--pw-primary)]" />
        <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--pw-surface-strong)]" />
      </div>
    </div>
  );
}

function FooterNavGroup({
  title,
  items,
  onSectionClick,
}: {
  title: string;
  items: Array<{ href?: string; label: string; disabled?: boolean }>;
  onSectionClick?: (sectionId: string) => void;
}) {
  return (
    <nav aria-label={title} className="min-w-36">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--pw-subtle)]">{title}</p>
      <div className="mt-5 grid gap-3.5">
        {items.map((item) => {
          if (item.disabled) {
            return (
              <span className="text-[1.02rem] font-medium text-[var(--pw-subtle)]" key={item.label}>
                {item.label}
              </span>
            );
          }

          if (item.href?.startsWith("#")) {
            const href = item.href;

            return (
              <Link
                className="text-[1.02rem] font-medium text-[var(--pw-muted)] transition hover:text-[var(--pw-heading)]"
                href={href}
                key={item.label}
                onClick={(event) => {
                  event.preventDefault();
                  onSectionClick?.(href.slice(1));
                }}
              >
                {item.label}
              </Link>
            );
          }

          return (
            <Link
              className="text-[1.02rem] font-medium text-[var(--pw-muted)] transition hover:text-[var(--pw-heading)]"
              href={item.href ?? "#"}
              key={item.label}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function PawIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" preserveAspectRatio="xMidYMid meet" viewBox="0 0 24 24">
      <path
        d="M7 11.5c-1.2 0-2.2-1.5-2.2-3.3S5.8 5 7 5s2.2 1.5 2.2 3.2S8.2 11.5 7 11.5Zm10 0c-1.2 0-2.2-1.5-2.2-3.3S15.8 5 17 5s2.2 1.5 2.2 3.2S18.2 11.5 17 11.5ZM4.8 15.2c0-1.3 1.2-2.4 2.7-2.4 1.3 0 2.3.8 2.9 2 .6-1.1 1.8-1.8 3.6-1.8 1.8 0 3 1 3.6 2.3.5-1.2 1.6-1.9 2.9-1.9 1.5 0 2.7 1 2.7 2.4 0 1.1-.8 2-1.8 2.5-1.2.6-3 .9-7.4.9s-6.2-.3-7.4-.9c-1-.5-1.8-1.4-1.8-2.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" preserveAspectRatio="xMidYMid meet" viewBox="0 0 24 24">
      <path
        d="M12 4 6 6.5V12c0 3.8 2.7 6.9 6 8 3.3-1.1 6-4.2 6-8V6.5L12 4Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="m8.7 12 2.1 2.1 4.5-4.6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function SparkIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" preserveAspectRatio="xMidYMid meet" viewBox="0 0 24 24">
      <path d="M12 4.5 13.8 9l4.5 1.8-4.5 1.8L12 17l-1.8-4.4L5.7 10.8 10.2 9 12 4.5Z" fill="currentColor" />
      <path d="m18.5 14 1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1 1-2.5Z" fill="currentColor" opacity=".75" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" preserveAspectRatio="xMidYMid meet" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="7.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 8v4l2.75 1.7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}
