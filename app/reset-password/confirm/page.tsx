"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AccountAccessLayout, AccountStatus, accountPrimaryClass } from "../../components/account-access";
import { parseRecoveryFragment } from "../../lib/security/auth-abuse/recovery-fragment.mjs";

type RecoveryPageState = "loading" | "ready" | "missing_fragment" | "malformed_recovery_link" | "already_consumed" | "provider_invalid" | "service_unavailable";

export default function ResetPasswordConfirmPage() {
  const [tokenHash, setTokenHash] = useState("");
  const [state, setState] = useState<RecoveryPageState>("loading");

  useEffect(() => {
    const fragment = window.location.hash;
    const error = new URLSearchParams(window.location.search).get("error");
    // Remove the token-bearing fragment immediately. It is retained only in
    // component memory until the user explicitly submits the native form.
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      if (error) {
        setState(error === "replayed"
          ? "already_consumed"
          : error === "malformed"
            ? "malformed_recovery_link"
            : error === "unavailable"
              ? "service_unavailable"
              : "provider_invalid");
        return;
      }
      const recovery = parseRecoveryFragment(fragment);
      if (!recovery.ok) {
        setState(recovery.reason === "missing_fragment" ? "missing_fragment" : "malformed_recovery_link");
        return;
      }
      if (!recovery.tokenHash) {
        setState("malformed_recovery_link");
        return;
      }
      setTokenHash(recovery.tokenHash);
      setState("ready");
    });
    return () => { active = false; };
  }, []);

  return (
    <AccountAccessLayout
      supportingText="For your security, the recovery link is used only after you choose to continue."
      title="Confirm your password reset"
    >
      {state === "loading" ? <AccountStatus text="Preparing your secure reset..." /> : null}
      {state === "ready" ? (
        <div className="space-y-5">
          <AccountStatus text="Your password reset request is ready. Continue when you are ready to choose a new password." />
          <form action="/api/auth/recovery/continue" encType="application/x-www-form-urlencoded" method="post">
            <input name="token_hash" type="hidden" value={tokenHash} />
            <input name="type" type="hidden" value="recovery" />
            <button className={accountPrimaryClass} type="submit">Continue to reset password</button>
          </form>
        </div>
      ) : null}
      {state !== "loading" && state !== "ready" ? (
        <div className="space-y-5">
          <AccountStatus tone="danger" text="This password reset link can’t be used. Request a new link and try again." />
          <Link className={accountPrimaryClass} href="/forgot-password" prefetch={false}>Request a new reset link</Link>
        </div>
      ) : null}
    </AccountAccessLayout>
  );
}
