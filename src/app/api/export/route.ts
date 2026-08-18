import { isSelf, getStats, type Event } from "@/lib/log";
import { readThread } from "@/lib/forum";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Full-fidelity harvest endpoint for the operator.
 *
 * `/api/stats` deliberately returns only the newest 200 events (a display
 * window). That is fine for a dashboard but useless for preserving the record:
 * without this route the experiment's raw history could never be exported
 * beyond 200 rows, no matter how large EVENT_CAP is.
 *
 * PAGINATED BY DESIGN: the event log holds up to EVENT_CAP (20k) entries at
 * ~195 B each, so dumping it whole would approach ~4 MB and collide with the
 * platform's response-body limit — failing exactly after the traffic burst this
 * endpoint exists to capture. Callers page with ?offset= until `done` is true.
 *
 * Gated on the self-token, NOT public: events carry salted ipHash values, and
 * the public /api/stats contract stays exactly as it was. Published datasets
 * strip ipHash before release.
 */

const DEFAULT_PAGE = 2000; // ~0.4 MB of events — comfortably under the limit
const MAX_PAGE = 5000;

export async function GET(request: Request) {
  if (!isSelf(request.headers))
    return Response.json({ error: "forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10) || 0);
  const limit = Math.min(
    MAX_PAGE,
    Math.max(1, parseInt(url.searchParams.get("limit") || String(DEFAULT_PAGE), 10) || DEFAULT_PAGE)
  );
  // Summary (tallies/checkins/commons) rides along on the first page only, so
  // paging through a large log doesn't repeat it.
  const withSummary = offset === 0;

  try {
    const [eventsRaw, stats, thread] = await Promise.all([
      store.lrange("events", offset, offset + limit - 1),
      withSummary ? getStats() : Promise.resolve(null),
      withSummary ? readThread(1000) : Promise.resolve(null),
    ]);

    const events = eventsRaw
      .map((s) => {
        try {
          return JSON.parse(s) as Event;
        } catch {
          return null;
        }
      })
      .filter((e): e is Event => e !== null);

    return Response.json({
      exported_at: new Date().toISOString(),
      page: { offset, limit, returned: eventsRaw.length, done: eventsRaw.length < limit },
      events, // newest first, includes excluded/self traffic
      ...(stats && thread
        ? {
            checkins: stats.checkins,
            commons: thread,
            tallies: {
              totalVisits: stats.totalVisits,
              verifiedAgents: stats.verifiedAgents,
              uniqueVisitors: stats.uniqueVisitors,
              byVerdict: stats.byVerdict,
              byAgent: stats.byAgent,
              byOperator: stats.byOperator,
              byPath: stats.byPath,
              byCountry: stats.byCountry,
            },
            storeMode: stats.storeMode,
          }
        : {}),
    });
  } catch {
    return Response.json(
      { error: "export storage temporarily unavailable — retry shortly" },
      { status: 503 }
    );
  }
}
