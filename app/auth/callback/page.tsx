"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { AccountAccessLayout, AccountStatus } from "../../components/account-access";
import { ensureCanonicalApplicationUser, resolvePostGoogleAuthDestination } from "../../lib/auth-identity";
import { getBrowserSupabase } from "../../lib/supabase";

export default function AuthCallbackPage() {
  return <Suspense fallback={null}><AuthCallbackContent /></Suspense>;
}

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [statusText, setStatusText] = useState("Finishing Google sign-in…");
  const startedRef = useRef(false);
  const requestedNext = searchParams.get("next");
  const callbackCode = searchParams.get("code");
  const providerError = searchParams.get("error_description") || searchParams.get("error");

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (providerError || !callbackCode) { router.replace("/login?error=google_auth_failed"); return; }
    const client = getBrowserSupabase();
    if (!client) { router.replace("/login?error=google_auth_failed"); return; }
    void (async () => {
      const { error: exchangeError } = await client.auth.exchangeCodeForSession(callbackCode);
      if (exchangeError) throw exchangeError;
      const { data } = await client.auth.getUser();
      if (!data.user) throw new Error("AUTH_USER_MISSING");
      setStatusText("Opening your Furvise home…");
      const { hasPet } = await ensureCanonicalApplicationUser(client, data.user);
      router.replace(resolvePostGoogleAuthDestination(hasPet, requestedNext));
    })().catch(() => router.replace("/login?error=google_auth_failed"));
  }, [callbackCode, providerError, requestedNext, router]);

  return <AccountAccessLayout supportingText="Finishing your secure sign-in." title="Connecting to Furvise">
    <AccountStatus text={statusText} />
  </AccountAccessLayout>;
}
