import { getAuthenticatedApiContext } from "../../lib/authenticated-api-server";
import { beginIdempotentRateLimitedOperation } from "../../lib/security/idempotency";
import { API_BODY_LIMITS, RequestBoundaryError, hasOnlyKeys, isUuid, readBoundedJson } from "../../lib/security/request";
import type { DogProductFeedbackRow, ProductFeedbackType } from "../../lib/supabase";

const FEEDBACK_TYPES = new Set<ProductFeedbackType>(["saved", "tried", "worked", "did_not_work", "too_expensive", "avoid_product"]);

export async function POST(request: Request) {
  const context = await getAuthenticatedApiContext(request);
  if ("response" in context) return context.response;
  const parsed = await parseFeedbackBody(request, false);
  if ("response" in parsed) return parsed.response;
  const { data: pet } = await context.supabase.from("dog_profiles").select("id").eq("id", parsed.dogProfileId).eq("user_id", context.userId).maybeSingle<{ id: string }>();
  if (!pet) return Response.json({ error: "That pet profile is not available." }, { status: 404 });
  const gate = await beginIdempotentRateLimitedOperation({ operationType: "product_feedback.create", payload: parsed, policy: "PROFILE_WRITE", request, route: "/api/product-feedback", supabase: context.supabase, userId: context.userId });
  if ("response" in gate) return gate.response;
  return gate.operation.execute(async () => {
    let { data, error } = await context.supabase.from("dog_product_feedback").insert({ dog_profile_id: parsed.dogProfileId, feedback_type: parsed.feedbackType, note: parsed.note, product_id: parsed.productId, product_name: parsed.productName, user_id: context.userId }).select().single<DogProductFeedbackRow>();
    if (error?.code === "23505") {
      const replay = await context.supabase.from("dog_product_feedback").select("*").eq("user_id", context.userId).eq("dog_profile_id", parsed.dogProfileId).eq("product_id", parsed.productId).eq("feedback_type", parsed.feedbackType).maybeSingle<DogProductFeedbackRow>();
      data = replay.data; error = replay.error;
    }
    if (error || !data) return Response.json({ error: "Product feedback could not be saved." }, { status: 503 });
    return Response.json({ feedback: data }, { status: 201 });
  });
}

export async function DELETE(request: Request) {
  const context = await getAuthenticatedApiContext(request);
  if ("response" in context) return context.response;
  const parsed = await parseFeedbackBody(request, true);
  if ("response" in parsed) return parsed.response;
  const gate = await beginIdempotentRateLimitedOperation({ operationType: "product_feedback.delete", payload: { dogProfileId: parsed.dogProfileId, feedbackId: parsed.feedbackId }, policy: "DESTRUCTIVE_WRITE", request, retention: "destructive", route: "/api/product-feedback", supabase: context.supabase, userId: context.userId });
  if ("response" in gate) return gate.response;
  return gate.operation.execute(async () => {
    const { error } = await context.supabase.from("dog_product_feedback").delete().eq("id", parsed.feedbackId).eq("dog_profile_id", parsed.dogProfileId).eq("user_id", context.userId);
    if (error) return Response.json({ error: "Product feedback could not be removed." }, { status: 503 });
    return new Response(null, { status: 204 });
  });
}

async function parseFeedbackBody(request: Request, deleting: boolean): Promise<{ response: Response } | { dogProfileId: string; feedbackId: string; feedbackType: ProductFeedbackType; note: string | null; productId: string; productName: string }> {
  let raw: unknown;
  try { raw = await readBoundedJson(request, API_BODY_LIMITS.standard); }
  catch (error) { const tooLarge = error instanceof RequestBoundaryError && error.code === "PAYLOAD_TOO_LARGE"; return { response: Response.json({ error: tooLarge ? "That feedback update is too large." : "Send valid product feedback." }, { status: tooLarge ? 413 : 400 }) }; }
  const keys = deleting ? ["dogProfileId", "feedbackId"] : ["dogProfileId", "productId", "productName", "feedbackType", "note"];
  if (!hasOnlyKeys(raw, keys)) return { response: Response.json({ error: "The feedback update contains unsupported fields." }, { status: 400 }) };
  const body = raw as Record<string, unknown>;
  const dogProfileId = typeof body.dogProfileId === "string" ? body.dogProfileId : "";
  const feedbackId = typeof body.feedbackId === "string" ? body.feedbackId : "";
  const productId = typeof body.productId === "string" ? body.productId.trim() : "";
  const productName = typeof body.productName === "string" ? body.productName.trim() : "";
  const feedbackType = typeof body.feedbackType === "string" && FEEDBACK_TYPES.has(body.feedbackType as ProductFeedbackType) ? body.feedbackType as ProductFeedbackType : deleting ? "saved" : null;
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;
  if (!isUuid(dogProfileId) || (deleting ? !isUuid(feedbackId) : !feedbackType || !productId || productId.length > 200 || !productName || productName.length > 300 || note !== null && note.length > 1000)) return { response: Response.json({ error: "Review the product feedback and try again." }, { status: 400 }) };
  return { dogProfileId, feedbackId, feedbackType: feedbackType as ProductFeedbackType, note, productId, productName };
}
