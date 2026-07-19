"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { buildLoginHref } from "./auth-routing";
import { getBrowserSupabase } from "./supabase";

export type ConfirmedAuthStatus = "loading" | "signedIn" | "signedOut";

export type ConfirmedAuthState = {
  status: ConfirmedAuthStatus;
  user: User | null;
};

export function useConfirmedSupabaseAuth(): ConfirmedAuthState {
  const [authState, setAuthState] = useState<ConfirmedAuthState>({
    status: "loading",
    user: null,
  });

  useEffect(() => {
    const client = getBrowserSupabase();
    if (!client) {
      const timer = window.setTimeout(() => {
        setAuthState({ status: "signedOut", user: null });
      }, 0);

      return () => window.clearTimeout(timer);
    }

    let active = true;
    let initialCheckComplete = false;

    client.auth
      .getUser()
      .then(({ data }) => {
        if (!active) return;
        initialCheckComplete = true;
        setAuthState(data.user ? { status: "signedIn", user: data.user } : { status: "signedOut", user: null });
      })
      .catch(() => {
        if (!active) return;
        initialCheckComplete = true;
        setAuthState({ status: "signedOut", user: null });
      });

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, session) => {
      if (!active) return;

      if (event === "SIGNED_OUT" || !session?.user) {
        initialCheckComplete = true;
        setAuthState({ status: "signedOut", user: null });
        return;
      }

      if (!initialCheckComplete) {
        return;
      }

      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        setAuthState({ status: "signedIn", user: session.user });
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return authState;
}

export function useRequireConfirmedSupabaseAuth(): ConfirmedAuthState {
  const authState = useConfirmedSupabaseAuth();
  const router = useRouter();

  useEffect(() => {
    if (authState.status !== "signedOut") return;
    const nextPath = `${window.location.pathname}${window.location.search}`;
    router.replace(buildLoginHref(nextPath));
  }, [authState.status, router]);

  return authState;
}
