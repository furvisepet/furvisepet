"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AccountAccessLayout, AccountStatus, accountPrimaryClass } from "../../components/account-access";

const FRAGMENT_PREFIX = "#confirmation_url=";
const MAX_CONFIRMATION_URL_LENGTH = 4096;

export default function ResetPasswordConfirmPage() {
  const [confirmationUrl, setConfirmationUrl] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "invalid">("loading");

  useEffect(() => {
    const fragment = window.location.hash;
    const hasError = new URLSearchParams(window.location.search).has("error");
    // Remove the token-bearing fragment immediately. It is retained only in
    // component memory until the user explicitly submits the native form.
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      if (hasError || !fragment.startsWith(FRAGMENT_PREFIX)) {
        setState("invalid");
        return;
      }
      const value = fragment.slice(FRAGMENT_PREFIX.length);
      if (!value || value.length > MAX_CONFIRMATION_URL_LENGTH) {
        setState("invalid");
        return;
      }
      setConfirmationUrl(value);
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
            <input name="confirmation_url" type="hidden" value={confirmationUrl} />
            <button className={accountPrimaryClass} type="submit">Continue to reset password</button>
          </form>
        </div>
      ) : null}
      {state === "invalid" ? (
        <div className="space-y-5">
          <AccountStatus tone="danger" text="This password reset link is invalid, expired, or has already been used." />
          <Link className={accountPrimaryClass} href="/forgot-password" prefetch={false}>Request a new reset link</Link>
        </div>
      ) : null}
    </AccountAccessLayout>
  );
}
