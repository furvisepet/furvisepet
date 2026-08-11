import type { SupabaseClient, User } from "@supabase/supabase-js";

type AuthenticatedApiDependencies = {
  configurationAvailable: boolean;
  createBearerClient: (token: string) => SupabaseClient;
  createCookieClient: () => Promise<SupabaseClient | null>;
};

export async function resolveAuthenticatedApiContext(
  request: Request,
  dependencies: AuthenticatedApiDependencies,
): Promise<
  | { response: Response }
  | { supabase: SupabaseClient; user: User; userId: string }
> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!dependencies.configurationAvailable) {
    return { response: Response.json({ error: "Furvise is temporarily unavailable." }, { status: 503 }) };
  }

  const supabase = token
    ? dependencies.createBearerClient(token)
    : await dependencies.createCookieClient();
  if (!supabase) {
    return { response: Response.json({ error: "Furvise is temporarily unavailable." }, { status: 503 }) };
  }

  const { data } = token ? await supabase.auth.getUser(token) : await supabase.auth.getUser();
  if (!data.user) {
    return {
      response: Response.json(
        { error: token ? "Your session has expired." : "Authentication required." },
        { status: 401 },
      ),
    };
  }

  return { supabase, user: data.user, userId: data.user.id };
}
