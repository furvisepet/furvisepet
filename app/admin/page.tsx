import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createServerSupabase } from "../lib/supabase/server";
import { isFurviseOwner } from "../lib/operations/owner-access";
import Dashboard from "./dashboard";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {title:"Owner dashboard",robots:{index:false,follow:false}};
export default async function OwnerDashboardPage(){
 const db=await createServerSupabase();
 const user=db ? (await db.auth.getUser()).data.user : null;
 if(!user)redirect("/login?next=%2Fadmin");
 if(!isFurviseOwner(user))notFound();
 return <Dashboard />;
}
