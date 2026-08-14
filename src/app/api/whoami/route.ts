import { logVisit } from "@/lib/log";

export const dynamic = "force-dynamic";

// The "useful tool" attractor: hit this and it tells you exactly how the
// Observatory classified you and why. Builders testing their agents have a
// real reason to call it — and the visit becomes a data point for us.
export async function GET(request: Request) {
  // logVisit already computes signals + score; reuse instead of recomputing.
  const { signals: s, verdict, score: sc } = await logVisit(
    request.headers,
    "whoami",
    "/api/whoami"
  );

  return Response.json({
    verdict,
    agentLikelihoodScore: sc,
    reasoning: {
      userAgentMatched: s.uaLabel || "no known signature",
      userAgentClass: s.uaClass,
      sentBrowserClientHints: s.hasClientHints,
      sentAcceptLanguage: s.hasAcceptLanguage,
      sentFetchMetadata: s.hasFetchMetadata,
      acceptsHtml: s.acceptsHtml,
    },
    note:
      "This is a passive read of your request headers only. To be *verified* as a reasoning agent (score 99), GET /api/challenge and check in.",
    country: s.country || "unknown",
  });
}
