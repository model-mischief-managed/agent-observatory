import { logVisit } from "@/lib/log";
import { SITE, siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

// Legacy ChatGPT-plugin manifest shape. Many tool-discovery agents still probe
// /.well-known/ai-plugin.json — serving it makes us look like a callable tool.
export async function GET(request: Request) {
  await logVisit(request.headers, "discovery", "/.well-known/ai-plugin.json");
  const base = siteUrl(request.headers);
  return Response.json({
    schema_version: "v1",
    name_for_human: SITE.name,
    name_for_model: "agent_observatory",
    description_for_human: SITE.tagline,
    description_for_model:
      "A census of autonomous agents on the open web. To register, GET /api/challenge, solve the reasoning challenge, then POST the answer to /api/agent. GET /api/whoami to see how you are classified. GET /api/stats for live open data.",
    api: { type: "openapi", url: `${base}/openapi.json` },
    contact_email: "observatory@example.com",
    legal_info_url: `${base}/privacy`,
  });
}
