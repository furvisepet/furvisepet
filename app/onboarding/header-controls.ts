export type AuthStatus = "loading" | "authenticated" | "anonymous";

export type OnboardingHeaderAction = {
  href?: string;
  label: string;
  onClick?: () => void;
  variant?: "primary" | "secondary";
};

type BuildOnboardingHeaderControlsInput = {
  authStatus: AuthStatus;
  hasStartOver: boolean;
  onStartOver: () => void;
  userEmail: string;
};

export function buildOnboardingHeaderControls({
  authStatus,
  userEmail,
}: BuildOnboardingHeaderControlsInput): {
  actions: OnboardingHeaderAction[];
  backFallbackHref: string;
} {
  if (authStatus === "loading") {
    return {
      actions: [],
      backFallbackHref: "/",
    };
  }

  return {
    actions: [],
    backFallbackHref: userEmail ? "/dashboard" : "/",
  };
}
