import { AI_AGENTS, PLAIN_BOTS } from "@/lib/known-agents";
import { logVisit } from "@/lib/log";
import { siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

// Machine-readable version of /ai-crawlers — free, CORS-open reference data.
export async function GET(request: Request) {
  await logVisit(request.headers, "discovery", "/ai-crawlers.json");
  const base = siteUrl(request.headers);
  return Response.json(
    {
      name: "AI Crawler & Agent User-Agent List",
      source: `${base}/ai-crawlers`,
      license: "Apache-2.0",
      updated: new Date().toISOString(),
      matching: "case-insensitive substring against the User-Agent header",
      ai_agents: AI_AGENTS,
      plain_bots: PLAIN_BOTS,
    },
    { headers: { "Access-Control-Allow-Origin": "*" } }
  );
}
