import "server-only";

import { redirect } from "next/navigation";
import { createServerSupabase } from "../lib/supabase/server";

export async function PrivateRouteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect("/login");

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/login");

  return children;
}
