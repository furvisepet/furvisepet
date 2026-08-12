export type V2AuthVerifier = {
  auth: { getUser(token: string): Promise<{ data: { user: { id: string } | null }; error: unknown }> };
};

/**
 * Validates the browser bearer token with Supabase Auth. The returned ID is
 * server authority and is never read from SemanticFrame/model payload data.
 */
export async function verifyV2PersistenceUser(accessToken: string, verifier: V2AuthVerifier) {
  if (!accessToken) throw new Error("V2_AUTH_REQUIRED");
  const { data, error } = await verifier.auth.getUser(accessToken);
  if (error || !data.user?.id) throw new Error("V2_AUTH_INVALID");
  return data.user.id;
}
