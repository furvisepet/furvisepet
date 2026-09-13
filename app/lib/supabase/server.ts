import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const SESSION_AUTH_COOKIE = "furvise-auth-session";

export async function createServerSupabase() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;

  return createServerClient(normalizeSupabaseUrl(url), key, {
    cookieOptions: {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        const sessionOnly = cookieStore.has(SESSION_AUTH_COOKIE);
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, sessionOnly && options.maxAge !== 0
              ? { ...options, expires: undefined, maxAge: undefined }
              : options);
          });
        } catch {
          // Server Components cannot write cookies. The proxy refreshes them before rendering.
        }
      },
    },
  });
}

function normalizeSupabaseUrl(url: string) {
  return url.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
}
