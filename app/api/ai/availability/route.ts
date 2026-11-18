import { isAskEnabled } from "../../../lib/ai/availability.ts";

export const dynamic = "force-dynamic";

// Public capability only: no keys, billing details, owner records or provider calls.
export async function GET() {
  return Response.json({ ask: isAskEnabled() }, {
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}
