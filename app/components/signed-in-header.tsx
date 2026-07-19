"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppHeader } from "./app-header";
import { getBrowserSupabase, setBrowserSupabasePersistence } from "../lib/supabase";

type AuthState = "loading" | "anonymous" | "authenticated";

const appNavItems = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/pets", label: "Pets" },
  { href: "/care-log", label: "Care history" },
  { href: "/ask", label: "Ask Furvise" },
] as const;

export function SignedInHeader() {
  const router = useRouter();
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [signingOut, setSigningOut] = useState(false);

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
        if (active) setAuthState(data.user ? "authenticated" : "anonymous");
      })
      .catch(() => {
        if (active) setAuthState("anonymous");
      });
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      if (active) setAuthState(session?.user ? "authenticated" : "anonymous");
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
    const { error } = await client.auth.signOut();
    if (!error) {
      setBrowserSupabasePersistence(null);
      setAuthState("anonymous");
      router.replace("/");
      router.refresh();
    }
    setSigningOut(false);
  }

  const accountMenuItems =
    authState === "authenticated"
      ? [
          {
            type: "link" as const,
            href: "/account",
            label: "Account",
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
      accountMenuItems={accountMenuItems}
      authState={authState}
      brandHref="/"
      homepagePolish
      navItems={[...appNavItems]}
      sticky
      variant="site"
    />
  );
}
