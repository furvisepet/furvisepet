"use client";

import { useEffect, useState } from "react";
import { AppHeader } from "./app-header";
import { getBrowserSupabase } from "../lib/supabase";

type AuthState = "loading" | "anonymous" | "authenticated";

export function SignedInHeader({ variant = "site" }: { variant?: "homepage" | "site" }) {
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [accountIdentity, setAccountIdentity] = useState("");

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

  return (
    <AppHeader
      accountEmail={accountIdentity}
      authState={authState}
      brandHref="/"
      homepagePolish
      sticky
      variant={variant}
    />
  );
}
