import { generateVetBriefPdf } from "../../../../lib/vet-brief/pdf";
import { getVetBriefFilename, parseVetBriefDocument } from "../../../../lib/vet-brief/schema";
import { getVetBriefRequestContext, type VetBriefDatabaseRow } from "../../../../lib/vet-brief/server";
import { isUuid } from "../../../../lib/security/request";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getVetBriefRequestContext(request);
  if ("response" in context) return context.response;
  const { id } = await params;
  if (!isUuid(id)) return Response.json({ error: "That Vet Visit Brief identifier is invalid." }, { status: 400 });
  const { data } = await context.supabase.from("vet_visit_briefs").select("*").eq("id", id).eq("user_id", context.userId).maybeSingle<VetBriefDatabaseRow>();
  const document = data ? parseVetBriefDocument(data.confirmed_data) : null;
  if (!data || !document) return Response.json({ error: "That Vet Visit Brief is not available." }, { status: 404 });
  const pageSize = new URL(request.url).searchParams.get("size") === "a4" ? "a4" : "letter";
  const bytes = await generateVetBriefPdf(document, { pageSize });
  const filename = getVetBriefFilename(document.pet.name, document.generatedAt);
  return new Response(Buffer.from(bytes), {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(bytes.length),
      "Content-Type": "application/pdf",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
