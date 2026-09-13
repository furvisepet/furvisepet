import { getVetBriefRequestContext, toPublicVetBriefRecord, type VetBriefDatabaseRow } from "../../../lib/vet-brief/server";
import { isUuid } from "../../../lib/security/request";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getVetBriefRequestContext(request);
  if ("response" in context) return context.response;
  const { id } = await params;
  if (!isUuid(id)) return Response.json({ error: "That Vet Visit Brief identifier is invalid." }, { status: 400 });
  const { data, error } = await context.supabase.from("vet_visit_briefs").select("*").eq("id", id).eq("user_id", context.userId).maybeSingle<VetBriefDatabaseRow>();
  if (error || !data) return Response.json({ error: "That Vet Visit Brief is not available." }, { status: 404 });
  const brief = toPublicVetBriefRecord(data);
  return brief ? Response.json({ brief }) : Response.json({ error: "That Vet Visit Brief is not available." }, { status: 404 });
}
