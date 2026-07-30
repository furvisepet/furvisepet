import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server.js";
import {
  applyPrivateCacheHeaders,
  buildPrivateLoginPath,
  isPrivateRoute,
} from "../security/private-routes.ts";

const SESSION_AUTH_COOKIE = "furvise-auth-session";

export async function updateSupabaseSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const privateRoute = isPrivateRoute(request.nextUrl.pathname);

  if (!url || !key) {
    return privateRoute ? redirectToLogin(request) : response;
  }

  const malformedCookieNames = findMalformedAuthCookieNames(request, url);
  if (malformedCookieNames.length > 0) {
    malformedCookieNames.forEach((name) => response.cookies.set(name, "", { maxAge: 0, path: "/" }));
    return privateRoute ? redirectToLogin(request, response) : protectCacheWhenNeeded(response);
  }

  const supabase = createServerClient(normalizeSupabaseUrl(url), key, {
    cookieOptions: {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, requiredHeaders) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        const sessionOnly = request.cookies.has(SESSION_AUTH_COOKIE);
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, sessionOnly && options.maxAge !== 0
            ? { ...options, expires: undefined, maxAge: undefined }
            : options);
        });
        Object.entries(requiredHeaders).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });

  let claimsResult: Awaited<ReturnType<typeof supabase.auth.getClaims>>;
  try {
    claimsResult = await supabase.auth.getClaims();
  } catch {
    return privateRoute ? redirectToLogin(request, response) : protectCacheWhenNeeded(response);
  }
  const { data, error } = claimsResult;
  if (privateRoute && (error || !data?.claims?.sub)) {
    return redirectToLogin(request, response);
  }

  return protectCacheWhenNeeded(response, privateRoute);
}

function protectCacheWhenNeeded(response: NextResponse, privateRoute = false) {
  if (privateRoute || response.cookies.getAll().length > 0) {
    applyPrivateCacheHeaders(response.headers);
  }
  return response;
}

function redirectToLogin(request: NextRequest, cookieResponse?: NextResponse) {
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  const response = NextResponse.redirect(loginUrl);
  cookieResponse?.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
  applyPrivateCacheHeaders(response.headers);
  return response;
}

function normalizeSupabaseUrl(url: string) {
  return url.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
}

function findMalformedAuthCookieNames(request: NextRequest, supabaseUrl: string) {
  let projectRef = "";
  try {
    projectRef = new URL(supabaseUrl).hostname.split(".")[0] || "";
  } catch {
    return [];
  }
  if (!projectRef) return [];

  const prefix = `sb-${projectRef}-auth-token`;
  const authCookies = request.cookies.getAll()
    .filter(({ name }) => name === prefix || name.startsWith(`${prefix}.`))
    .sort((left, right) => cookieChunkIndex(left.name, prefix) - cookieChunkIndex(right.name, prefix));
  if (authCookies.length === 0) return [];

  const encoded = authCookies.map(({ value }) => value).join("");
  if (!encoded.startsWith("base64-")) return authCookies.map(({ name }) => name);
  try {
    const base64url = encoded.slice("base64-".length);
    const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64url.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    return [];
  } catch {
    return authCookies.map(({ name }) => name);
  }
}

function cookieChunkIndex(name: string, prefix: string) {
  if (name === prefix) return 0;
  const index = Number(name.slice(prefix.length + 1));
  return Number.isInteger(index) && index >= 0 ? index : Number.MAX_SAFE_INTEGER;
}

export { buildPrivateLoginPath, isPrivateRoute };
