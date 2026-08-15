"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppHeader } from "./app-header";
import { getBrowserSupabase, setBrowserSupabasePersistence } from "../lib/supabase";
import { clearNewPetOnboardingState } from "../lib/onboarding-drafts";
import { clearActivePetId } from "../lib/active-pet";
import { clearAskClientState } from "../lib/ask-conversations";

type AuthState = "loading" | "anonymous" | "authenticated";

export function SignedInHeader({ variant = "site" }: { variant?: "homepage" | "site" }) {
  const router = useRouter();
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [signingOut, setSigningOut] = useState(false);
  const [accountIdentity, setAccountIdentity] = useState("");
  const [signOutError, setSignOutError] = useState("");

  useEffect(() => {
    const client = getBrowserSupabase();
    if (!client) {
      const timer = window.setTimeout(() => setAuthState("anonymous"), 0);
      return () => window.clearTimeout(timer);
    }

    let active = true;
    client.auth
      .getUser()
      .then(({ data }) => {
        if (active) {
          setAuthState(data.user ? "authenticated" : "anonymous");
          setAccountIdentity(data.user?.email || "");
        }
      })
      .catch(() => {
        if (active) setAuthState("anonymous");
      });
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      if (active) {
        setAuthState(session?.user ? "authenticated" : "anonymous");
        setAccountIdentity(session?.user?.email || "");
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function signOut() {
    const client = getBrowserSupabase();
    if (!client || signingOut) return;
    setSigningOut(true);
    setSignOutError("");
    try {
      const { data: currentAuth } = await client.auth.getUser();
      const { error } = await client.auth.signOut();
      if (error) throw error;
      clearNewPetOnboardingState({ localStorage: window.localStorage, sessionStorage: window.sessionStorage }, currentAuth.user?.id || "");
      clearActivePetId(window.localStorage);
      clearAskClientState(window.localStorage);
      clearAskClientState(window.sessionStorage);
      setBrowserSupabasePersistence(null);
      setAuthState("anonymous");
      router.replace("/");
      router.refresh();
      window.location.replace("/");
    } catch {
      setSignOutError("Couldn't sign out. Please try again.");
    } finally {
      setSigningOut(false);
    }
  }

  const accountMenuItems =
    authState === "authenticated"
      ? [
          ...(accountIdentity ? [{ type: "label" as const, label: accountIdentity }] : []),
          {
            type: "link" as const,
            href: "/account",
            label: "Account",
          },
          {
            type: "link" as const,
            href: "/membership",
            label: "Membership",
          },
          {
            type: "link" as const,
            href: "/settings/security",
            label: "Security",
          },
          {
            type: "link" as const,
            href: "/privacy",
            label: "Privacy",
          },
          {
            type: "link" as const,
            href: "/terms",
            label: "Terms",
          },
          {
            type: "button" as const,
            disabled: signingOut,
            label: signingOut ? "Signing out..." : "Sign out",
            onClick: signOut,
            tone: "danger" as const,
          },
        ]
      : authState === "anonymous"
      ? [
          {
            type: "link" as const,
            href: "/login",
            label: "Sign in",
          },
        ]
      : [];

  return (
    <AppHeader
      accountError={signOutError}
      accountMenuItems={accountMenuItems}
      authState={authState}
      brandHref="/"
      homepagePolish
      sticky
      variant={variant}
    />
  );
}
