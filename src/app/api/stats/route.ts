import { getStats } from "@/lib/log";
import { SITE, experimentState } from "@/lib/site";

export const dynamic = "force-dynamic";

// Public, machine-readable results feed. Agents (and humans) can watch the
// experiment live. CORS-open so anyone can chart it.
export async function GET() {
  const [stats, exp] = [await getStats(), experimentState()];
  return Response.json(
    {
      // Which window these numbers belong to — the census was reset once, so a
      // consumer must be able to tell one run from another.
      experiment: {
        day: exp.dayNumber,
        of: SITE.durationDays,
        startUtc: SITE.startIso || null,
        endsUtc: exp.endsIso || null,
        ended: exp.ended,
      },
      ...stats,
    },
    { headers: { "Access-Control-Allow-Origin": "*" } }
  );
}
