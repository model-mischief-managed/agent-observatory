import { logVisit } from "@/lib/log";

export const dynamic = "force-dynamic";

// Fired by client-side JS once the page runs in a real (or headless) browser.
// A visitor that reaches "/" but never fires this is a pure-HTTP fetcher.
// count:false — this is a *signal about* an already-counted page view, so it
// must not bump visits:total or tally:path a second time.
export async function POST(request: Request) {
  await logVisit(request.headers, "beacon", "/api/beacon", {
    executedJs: true,
    count: false,
  });
  return Response.json({ ok: true });
}
