import { AccountAccessLayout } from "../components/account-access";
import { getConnectedAuthProviders, isConfirmedAuthUser } from "../lib/auth-identity";
import { createServerSupabase } from "../lib/supabase/server";
import { PasswordEmailForm } from "./password-email-form";

type ForgotPasswordPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ForgotPasswordPage({ searchParams }: ForgotPasswordPageProps) {
  const params = await searchParams;
  const setupEmail = params.mode === "setup" ? await getVerifiedSetupEmail() : null;
  const setupMode = Boolean(setupEmail);

  return (
    <AccountAccessLayout
      closeHref={setupMode ? "/settings/security" : "/"}
      closeLabel={setupMode ? "Close and return to Login & Security" : undefined}
      supportingText={setupMode ? "We'll send a secure link to your verified email." : undefined}
      title={setupMode ? "Set up a password" : "Reset your password"}
    >
      <PasswordEmailForm setupEmail={setupEmail} />
    </AccountAccessLayout>
  );
}

async function getVerifiedSetupEmail() {
  try {
    const supabase = await createServerSupabase();
    if (!supabase) return null;
    const { data, error } = await supabase.auth.getUser();
    if (error || !isConfirmedAuthUser(data.user)) return null;
    if (getConnectedAuthProviders(data.user).includes("email")) return null;
    return data.user?.email?.trim() || null;
  } catch {
    return null;
  }
}
