import { logVisit } from "@/lib/log";

export const dynamic = "force-dynamic";

// Channel-attribution entry points: /via/npm, /via/mcp, /via/hf, /via/gh-profile…
// Logs the arrival under a distinct path so the census can attribute yield per
// distribution channel, then forwards to the homepage.
export async function GET(
  request: Request,
  ctx: RouteContext<"/via/[channel]">
) {
  const { channel } = await ctx.params;
  const slug = (channel || "unknown").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 24);
  await logVisit(request.headers, "discovery", `via:${slug || "unknown"}`);
  return Response.redirect(new URL("/", request.url), 302);
}
