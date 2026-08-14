import { getStats } from "@/lib/log";

export const dynamic = "force-dynamic";

// Public, machine-readable results feed. Agents (and humans) can watch the
// experiment live. CORS-open so anyone can chart it.
export async function GET() {
  const stats = await getStats();
  return Response.json(stats, {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}
