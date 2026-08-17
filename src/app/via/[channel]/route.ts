import { logVisit } from "@/lib/log";
import { siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * Channel-attribution entry points: /via/npm, /via/gh-profile, /via/hf…
 *
 * The slug becomes a Redis hash field in `tally:path`, which getStats HGETALLs
 * on every dashboard render — so it MUST come from a fixed set. An open slug
 * lets anyone grow that hash without bound.
 *
 * Note: MCP tool calls log under `mcp:*`, deliberately NOT `via:mcp`, so a
 * registry-link arrival stays distinguishable from a mounted tool call.
 */
const CHANNELS = new Set([
  "mcp",
  "npm",
  "hf",
  "gist",
  "gh-profile",
  "github",
  "registry",
  "apis-guru",
  "skill",
  "feed",
  "x",
  "linkedin",
  "hn",
  "reddit",
]);

export async function GET(
  request: Request,
  ctx: RouteContext<"/via/[channel]">
) {
  const { channel } = await ctx.params;
  const slug = (channel || "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 24);
  await logVisit(request.headers, "discovery", `via:${CHANNELS.has(slug) ? slug : "other"}`);
  // Canonical host from the request headers — request.url can carry the
  // internal origin behind the platform proxy.
  return Response.redirect(new URL("/", siteUrl(request.headers)), 302);
}
