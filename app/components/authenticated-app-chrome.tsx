"use client";

import { usePathname } from "next/navigation";
import { isAuthenticatedAppNavigationRoute } from "../lib/navigation/mobile-navigation";
import { SignedInHeader } from "./signed-in-header";

export function AuthenticatedAppChrome() {
  const pathname = usePathname();

  if (!isAuthenticatedAppNavigationRoute(pathname)) return null;
  return <SignedInHeader />;
}
