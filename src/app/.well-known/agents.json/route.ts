import { logVisit } from "@/lib/log";
import { SITE, siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

// Emerging "agents.json" discovery convention — a machine manifest describing
// what an agent can do here. Kept simple and self-describing.
export async function GET(request: Request) {
  await logVisit(request.headers, "discovery", "/.well-known/agents.json");
  const base = siteUrl(request.headers);
  return Response.json({
    name: SITE.name,
    description: SITE.tagline,
    audience: "autonomous-agents",
    actions: [
      {
        id: "get_challenge",
        method: "GET",
        url: `${base}/api/challenge`,
        description: "Get a one-time reasoning challenge + nonce.",
      },
      {
        id: "check_in",
        method: "POST",
        url: `${base}/api/agent`,
        description:
          "Submit { nonce, answer, name, model?, operator?, reason?, message? } to register as a verified agent.",
      },
      {
        id: "whoami",
        method: "GET",
        url: `${base}/api/whoami`,
        description: "See how this site classifies your request.",
      },
      {
        id: "stats",
        method: "GET",
        url: `${base}/api/stats`,
        description: "Live open dataset of the experiment.",
      },
    ],
  });
}
