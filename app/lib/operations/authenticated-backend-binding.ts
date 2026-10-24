import "server-only";

import { isFurviseOwner } from "./owner-access";

// Public owning-platform project identity, reviewed independently in JF.
// This is a destination allowlist, never caller-selected and never a credential.
const EXPECTED_BACKEND_ORIGIN = "https://sxavgqzwfahljdvmisyq.supabase.co";

function matchesBackend(value: string | undefined) {
  if (typeof value !== "string" || !value || value !== value.trim()) return false;
  try {
    const url = new URL(value);
    return url.origin === EXPECTED_BACKEND_ORIGIN
      && url.username === "" && url.password === ""
      && url.search === "" && url.hash === ""
      && ["/", "/rest/v1", "/rest/v1/"].includes(url.pathname);
  } catch {
    return false;
  }
}

export function observeAuthenticatedBackendBinding(
  verifiedUser: { id?: string; is_anonymous?: boolean } | null | undefined,
  verifiedUserId: string | undefined,
  env: Record<string, string | undefined> = process.env,
) {
  // The owner-only route supplies only the user returned by getUser, after
  // authentication and immutable owner authorization. No HTTP value is used.
  const verifiedPrincipal = isFurviseOwner(verifiedUser)
    && verifiedUserId === verifiedUser?.id;
  const configuredDestinationMatches = matchesBackend(env.NEXT_PUBLIC_SUPABASE_URL);
  const requiredPublicMaterialPresent = Boolean(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const matched = verifiedPrincipal && configuredDestinationMatches && requiredPublicMaterialPresent;
  return {
    version: "authenticated-backend-binding.v1",
    status: matched ? "matched" : "unverified",
    serverAuthDestinationMatchesIntendedProject: configuredDestinationMatches,
    serverDataDestinationMatchesAuth: configuredDestinationMatches,
    principalVerifiedByAuthService: verifiedPrincipal,
    tenantAuthorityDerivedFromVerifiedPrincipal: verifiedPrincipal,
    // No DB request is made. These are deliberately distinct from destination
    // and principal binding, and cannot become true through material presence.
    deployedRlsAndGrants: "unknown",
    atomicAccounting: "unknown",
    independentlyVerifiedDeployment: false,
  } as const;
}
