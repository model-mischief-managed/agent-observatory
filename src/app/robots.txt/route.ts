import { logVisit } from "@/lib/log";
import { SITE, siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

// robots.txt as a logged route handler (not the static metadata file) so we can
// see exactly when a crawler fetches it — a strong "automated visitor" signal.
// We welcome everyone: the whole point is to be found by agents.
export async function GET(request: Request) {
  await logVisit(request.headers, "discovery", "/robots.txt");
  const base = siteUrl(request.headers);
  const body = `# ${SITE.name} — all agents welcome. This is a study of you. Hi.
User-agent: *
Allow: /

# Agent front door:
# ${base}/llms.txt

Sitemap: ${base}/sitemap.xml
`;
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
